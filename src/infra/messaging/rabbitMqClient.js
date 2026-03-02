export class RabbitMqClient {
  constructor({ config, logger, metrics, amqpModule }) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.amqpModule = amqpModule;
  }

  async connect() {
    const module = this.amqpModule || await import('amqplib');
    const amqp = module.default || module;
    this.connection = await amqp.connect(this.config.rabbitmqUrl);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(this.config.exchange, 'topic', { durable: true });
    await this.channel.assertExchange(this.config.retryExchange, 'topic', { durable: true });
    await this.channel.assertExchange(this.config.deadLetterExchange, 'topic', { durable: true });

    await this.channel.assertQueue(this.config.queue, {
      durable: true,
      deadLetterExchange: this.config.retryExchange,
      deadLetterRoutingKey: this.config.routingKey,
    });

    await this.channel.assertQueue(this.config.retryQueue, {
      durable: true,
      messageTtl: this.config.retryDelayMs,
      deadLetterExchange: this.config.exchange,
      deadLetterRoutingKey: this.config.routingKey,
    });

    await this.channel.assertQueue(this.config.deadLetterQueue, { durable: true });

    await this.channel.bindQueue(this.config.queue, this.config.exchange, this.config.routingKey);
    await this.channel.bindQueue(this.config.retryQueue, this.config.retryExchange, this.config.routingKey);
    await this.channel.bindQueue(this.config.deadLetterQueue, this.config.deadLetterExchange, this.config.routingKey);

    await this.channel.prefetch(10);
  }

  async consume(onMessage) {
    await this.channel.consume(this.config.queue, async (msg) => {
      if (!msg) return;

      const retryCount = Number(msg.properties.headers?.['x-retry-count'] || 0);
      const payload = msg.content.toString();

      try {
        await onMessage(payload);
        this.channel.ack(msg);
      } catch (error) {
        this.metrics.inc('retry_count');
        if (retryCount >= this.config.retryAttempts) {
          this.channel.publish(
            this.config.deadLetterExchange,
            this.config.routingKey,
            msg.content,
            { persistent: true, headers: { ...msg.properties.headers, reason: error.message } },
          );
          this.channel.ack(msg);
          this.logger.error({ error: error.message }, 'Message moved to DLQ');
          return;
        }

        this.channel.publish(
          this.config.retryExchange,
          this.config.routingKey,
          msg.content,
          {
            persistent: true,
            headers: { ...msg.properties.headers, 'x-retry-count': retryCount + 1 },
          },
        );
        this.channel.ack(msg);
      }
    }, { noAck: false });
  }
}
