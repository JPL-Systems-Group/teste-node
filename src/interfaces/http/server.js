import http from 'node:http';
import { healthController } from './controllers/healthController.js';
import { metricsController } from './controllers/metricsController.js';
import { ordersController } from './controllers/ordersController.js';

export function createHttpServer({ auth, repository, metrics, logger }) {
  const metricsHandler = metricsController({ metrics });
  const orderLookupHandler = ordersController({ repository });

  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return healthController(req, res);
    if (req.method === 'GET' && req.url === '/metrics') return metricsHandler(req, res);

    if (req.method === 'GET' && req.url.startsWith('/orders/')) {
      if (!auth(req, res)) return;
      try {
        await orderLookupHandler(req, res);
      } catch (error) {
        logger.error({ error: error.message }, 'Orders endpoint failure');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Internal server error' }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found' }));
  });
}
