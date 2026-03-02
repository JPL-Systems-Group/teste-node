export class OrderRepository {
  constructor({ db }) {
    this.db = db;
  }

  async migrate() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS processed_orders (
        order_id TEXT PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS order_processing_log (
        id BIGSERIAL PRIMARY KEY,
        order_id TEXT NOT NULL,
        event_payload JSONB NOT NULL,
        processing_status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  async processOrderTransaction(orderId, payload) {
    return this.db.withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO processed_orders(order_id) VALUES($1) ON CONFLICT (order_id) DO NOTHING RETURNING order_id`,
        [orderId],
      );

      const isNew = inserted.rowCount === 1;
      await client.query(
        'INSERT INTO order_processing_log(order_id, event_payload, processing_status) VALUES($1, $2::jsonb, $3)',
        [orderId, JSON.stringify(payload), isNew ? 'Processed' : 'Duplicate'],
      );

      return isNew;
    });
  }
}
