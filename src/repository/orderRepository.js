class OrderRepository {
  constructor() {
    this.orders = new Map();
    this.processedOrderIds = new Set();
  }

  isProcessed(orderId) {
    return this.processedOrderIds.has(orderId);
  }

  markProcessed(orderId) {
    this.processedOrderIds.add(orderId);
    this.orders.set(orderId, {
      id: orderId,
      status: 'Processed',
      updatedAt: new Date().toISOString(),
    });

    return this.orders.get(orderId);
  }

  getById(orderId) {
    return this.orders.get(orderId) || null;
  }
}

module.exports = { OrderRepository };
