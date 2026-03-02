export class OrderProcessor {
  constructor({ repository, logger, metrics }) {
    this.repository = repository;
    this.logger = logger;
    this.metrics = metrics;
  }

  async processOrderEvent(event) {
    if (!event?.orderId) throw new Error('Invalid event: orderId is required');

    const processed = await this.repository.processOrderTransaction(event.orderId, event);
    if (!processed) {
      this.logger.info({ orderId: event.orderId }, 'Order already processed (idempotent hit)');
      return { status: 'already_processed', orderId: event.orderId };
    }

    this.metrics.inc('total_orders_processed');
    this.logger.info({ orderId: event.orderId }, 'Order processed');
    return { status: 'processed', orderId: event.orderId };
  }
}
