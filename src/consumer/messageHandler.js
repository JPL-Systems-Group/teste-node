const { increment } = require('../metrics/metrics');
const { withRetry } = require('./retry');

function createMessageHandler({ orderService, logger, retryConfig }) {
  return async function handleMessage(rawMessage) {
    increment('queueMessagesReceived');

    let payload;
    try {
      payload = JSON.parse(rawMessage);
    } catch (error) {
      increment('orderProcessingFailures');
      logger.error({ rawMessage, error: error.message }, 'Payload inválido');
      throw error;
    }

    try {
      return await withRetry(
        () => orderService.processOrder(payload),
        {
          retries: retryConfig.retries,
          delayMs: retryConfig.delayMs,
          logger,
          context: { orderId: payload.orderId },
        },
      );
    } catch (error) {
      increment('orderProcessingFailures');
      logger.error({ orderId: payload.orderId, error: error.message }, 'Mensagem reprovada após retries');
      throw error;
    }
  };
}

module.exports = { createMessageHandler };
