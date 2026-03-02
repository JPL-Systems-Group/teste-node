const http = require('http');
const { healthController } = require('../controllers/healthController');

function createApp({ logger }) {
  const routes = {
    'GET /health': healthController,
  };

  const server = http.createServer((req, res) => {
    const key = `${req.method} ${req.url}`;
    const handler = routes[key];

    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not Found' }));
      return;
    }

    logger.info({ method: req.method, path: req.url }, 'HTTP request recebida');
    handler(req, res);
  });

  return server;
}

module.exports = { createApp };
