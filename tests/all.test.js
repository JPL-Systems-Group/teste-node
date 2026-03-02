const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { env } = require('../src/config/env');
const { OrderRepository } = require('../src/repository/orderRepository');
const { OrderService } = require('../src/service/orderService');
const { withRetry } = require('../src/consumer/retry');
const { createMessageHandler } = require('../src/consumer/messageHandler');
const { MockQueueClient } = require('../src/consumer/queueClient');
const { healthController } = require('../src/controllers/healthController');
const { createApp } = require('../src/app/createApp');
const { logger } = require('../src/logging/logger');
const { increment, snapshot } = require('../src/metrics/metrics');
const { bootstrap } = require('../src/index');

test('env has defaults', () => {
  assert.equal(env.port, 3000);
  assert.equal(env.retryLimit, 3);
});

test('repository stores processed orders', () => {
  const repo = new OrderRepository();
  repo.markProcessed('1');
  assert.equal(repo.isProcessed('1'), true);
  assert.equal(repo.getById('1').status, 'Processed');
});

test('orderService processes and applies idempotency', async () => {
  const log = { info: () => {} };
  const svc = new OrderService({ orderRepository: new OrderRepository(), logger: log });
  const first = await svc.processOrder({ orderId: 'A' });
  const second = await svc.processOrder({ orderId: 'A' });
  assert.equal(first.status, 'processed');
  assert.equal(second.status, 'already_processed');
});

test('withRetry retries and succeeds', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw new Error('fail');
    return 'ok';
  }, { retries: 3, delayMs: 1, logger: { error: () => {} } });
  assert.equal(result, 'ok');
});

test('messageHandler parses and delegates', async () => {
  let called = false;
  const handler = createMessageHandler({
    orderService: { processOrder: async () => { called = true; return { status: 'processed' }; } },
    logger: { error: () => {} },
    retryConfig: { retries: 1, delayMs: 1 },
  });

  const result = await handler('{"orderId":"11"}');
  assert.equal(result.status, 'processed');
  assert.equal(called, true);
});

test('mock queue publishes to registered consumer', async () => {
  const queue = new MockQueueClient({ logger: { info: () => {} } });
  let raw;
  await queue.connect();
  await queue.consume(async (msg) => { raw = msg; });
  await queue.publish({ orderId: '22' });
  assert.equal(raw, '{"orderId":"22"}');
});

test('healthController returns 200 payload', async () => {
  const req = {};
  const chunks = [];
  const res = {
    writeHead: (status) => { assert.equal(status, 200); },
    end: (chunk) => chunks.push(chunk),
  };
  healthController(req, res);
  const body = JSON.parse(chunks.join(''));
  assert.equal(body.status, 'ok');
});

test('createApp serves /health', async () => {
  const server = createApp({ logger: { info: () => {} } });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const data = await new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
  });

  assert.equal(data.status, 200);
  assert.equal(data.body.status, 'ok');
  server.close();
});

test('logger exposes functions', () => {
  assert.equal(typeof logger.info, 'function');
  assert.equal(typeof logger.error, 'function');
});

test('metrics increments known metric', () => {
  const before = snapshot().ordersProcessed;
  increment('ordersProcessed');
  assert.equal(snapshot().ordersProcessed, before + 1);
});

test('bootstrap starts server and queue', async () => {
  const { server, queueClient } = await bootstrap();
  assert.ok(server);
  assert.ok(queueClient);
  server.close();
});
