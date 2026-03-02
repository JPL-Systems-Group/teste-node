const { snapshot } = require('../metrics/metrics');

function healthController(req, res) {
  const body = {
    status: 'ok',
    uptime: process.uptime(),
    metrics: snapshot(),
    traceHint: 'Propague x-correlation-id e traceparent para tracing distribuído',
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

module.exports = { healthController };
