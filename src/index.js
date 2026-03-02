const { env } = require('./config/env');
const { logger } = require('./logging/logger');
const { createApp } = require('./app/createApp');
const { OrderRepository } = require('./repository/orderRepository');
const { OrderService } = require('./service/orderService');
const { createMessageHandler } = require('./consumer/messageHandler');
const { MockQueueClient } = require('./consumer/queueClient');

async function bootstrap() {
  const server = createApp({ logger });
  const orderRepository = new OrderRepository();
  const orderService = new OrderService({ orderRepository, logger });

  const messageHandler = createMessageHandler({
    orderService,
    logger,
    retryConfig: {
      retries: env.retryLimit,
      delayMs: env.retryDelayMs,
    },
  });

  const queueClient = new MockQueueClient({ logger });

  await queueClient.connect();
  await queueClient.consume(messageHandler);

  await new Promise((resolve) => {
    server.listen(env.port, () => {
      logger.info({ port: env.port, queue: env.queueName, mockQueue: true }, 'order-processor iniciado');
      resolve();
    });
  });

  return { server, queueClient };
}

if (require.main === module) {
  bootstrap().catch((error) => {
    logger.fatal({ error: error.message }, 'Falha crítica ao iniciar aplicação');
    process.exit(1);
  });
}

module.exports = { bootstrap };
