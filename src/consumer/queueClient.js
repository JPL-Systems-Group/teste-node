class MockQueueClient {
  constructor({ logger }) {
    this.logger = logger;
    this.onMessage = null;
  }

  async connect() {
    this.logger.info({}, 'MockQueueClient conectado');
  }

  async consume(onMessage) {
    this.onMessage = onMessage;
    this.logger.info({}, 'MockQueueClient pronto para consumir mensagens');
  }

  async publish(message) {
    if (!this.onMessage) {
      throw new Error('Consumidor não inicializado no MockQueueClient');
    }

    await this.onMessage(JSON.stringify(message));
  }
}

module.exports = { MockQueueClient };
