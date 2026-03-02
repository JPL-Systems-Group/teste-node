const { increment } = require('../metrics/metrics');

class OrderService {
  constructor({ orderRepository, logger }) {
    this.orderRepository = orderRepository;
    this.logger = logger;
  }

  async processOrder(orderCreatedEvent) {
    const orderId = orderCreatedEvent?.orderId;

    if (!orderId) {
      throw new Error('Evento inválido: orderId é obrigatório');
    }

    if (this.orderRepository.isProcessed(orderId)) {
      this.logger.info({ orderId }, 'Pedido já processado (idempotência)');
      return {
        status: 'already_processed',
        order: this.orderRepository.getById(orderId),
      };
    }

    const order = this.orderRepository.markProcessed(orderId);
    increment('ordersProcessed');

    this.logger.info({ orderId, status: order.status }, 'Pedido processado com sucesso');

    return {
      status: 'processed',
      order,
    };
  }
}

module.exports = { OrderService };
