export function ordersController({ repository }) {
  return async function handleOrderLookup(req, res) {
    const orderId = req.url.split('/').pop();
    const result = await repository.db.query('SELECT order_id, processed_at FROM processed_orders WHERE order_id = $1', [orderId]);

    if (result.rowCount === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Order not found' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: result.rows[0].order_id, processedAt: result.rows[0].processed_at }));
  };
}
