export function createOrderCreatedHandler({ processor, logger, metrics }) {
  return async function handleOrderCreated(messageContent) {
    let event;
    try {
      event = JSON.parse(messageContent);
    } catch (error) {
      metrics.inc('total_failures');
      logger.error({ error: error.message }, 'Invalid JSON message');
      throw error;
    }

    try {
      return await processor.processOrderEvent(event);
    } catch (error) {
      metrics.inc('total_failures');
      throw error;
    }
  };
}
