import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';

import { loadConfig } from '../src/config.js';
import { getPrometheusMetrics, getMetricsSnapshot, inc } from '../src/infra/observability/metrics.js';
import { OrderProcessor } from '../src/domain/orderProcessor.js';
import { createOrderCreatedHandler } from '../src/application/handleOrderCreated.js';
import { OrderRepository } from '../src/infra/db/orderRepository.js';
import { PostgresClient } from '../src/infra/db/postgresClient.js';
import { verifyJwtHs256, authMiddleware } from '../src/interfaces/http/middleware/authMiddleware.js';
import { createHttpServer } from '../src/interfaces/http/server.js';
import { RabbitMqClient } from '../src/infra/messaging/rabbitMqClient.js';

test('loadConfig validates required env', () => {
  assert.throws(() => loadConfig({}), /Missing required environment variables/);
});

test('loadConfig maps env values', () => {
  const cfg = loadConfig({
    PORT: '3000', RABBITMQ_URL: 'amqp://x', POSTGRES_URL: 'postgres://x', JWT_SECRET: 's', RETRY_ATTEMPTS: '3', RETRY_DELAY_MS: '10',
  });
  assert.equal(cfg.port, 3000);
  assert.equal(cfg.retryAttempts, 3);
});

test('metrics expose prometheus output', () => {
  inc('total_orders_processed');
  const text = getPrometheusMetrics();
  assert.match(text, /total_orders_processed/);
  assert.ok(getMetricsSnapshot().total_orders_processed >= 1);
});

test('order processor idempotency behavior', async () => {
  let first = true;
  const repository = { processOrderTransaction: async () => { const r = first; first = false; return r; } };
  const processor = new OrderProcessor({ repository, logger: { info: () => {} }, metrics: { inc: () => {} } });
  const a = await processor.processOrderEvent({ orderId: '1' });
  const b = await processor.processOrderEvent({ orderId: '1' });
  assert.equal(a.status, 'processed');
  assert.equal(b.status, 'already_processed');
});

test('application handler handles invalid json and db failures', async () => {
  const metricNames = [];
  const handler = createOrderCreatedHandler({
    processor: { processOrderEvent: async () => { throw new Error('db down'); } },
    logger: { error: () => {} },
    metrics: { inc: (name) => metricNames.push(name) },
  });

  await assert.rejects(() => handler('bad-json'));
  await assert.rejects(() => handler('{"orderId":"1"}'));
  assert.ok(metricNames.includes('total_failures'));
});

test('order repository migration and transaction SQL', async () => {
  const calls = [];
  const db = {
    query: async (sql) => calls.push(sql),
    withTransaction: async (fn) => fn({
      query: async (sql) => {
        if (sql.includes('RETURNING')) return { rowCount: 1 };
        return { rowCount: 1 };
      },
    }),
  };
  const repo = new OrderRepository({ db });
  await repo.migrate();
  const result = await repo.processOrderTransaction('o1', { orderId: 'o1' });
  assert.equal(result, true);
  assert.equal(calls.length, 2);
});

test('postgres client transaction rollback on error', async () => {
  const client = {
    queryCalls: [],
    async query(sql) { this.queryCalls.push(sql); if (sql === 'SELECT 1') return {}; if (sql === 'ROLLBACK') return {}; if (sql === 'BEGIN') return {}; if (sql === 'COMMIT') return {}; throw new Error('q'); },
    release() {},
  };
  const pool = {
    query: async () => ({}),
    connect: async () => client,
    end: async () => {},
  };
  const pgModule = { default: { Pool: class { constructor() { return pool; } } } };
  const pg = new PostgresClient({ connectionString: 'postgres://x', pgModule });
  await pg.connect();
  await assert.rejects(() => pg.withTransaction(async () => { throw new Error('boom'); }));
});

function sign(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

test('jwt verification and auth middleware', () => {
  const token = sign({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 60 }, 'secret');
  const payload = verifyJwtHs256(token, 'secret');
  assert.equal(payload.sub, 'u1');

  const middleware = authMiddleware({ jwtSecret: 'secret', logger: { error: () => {} } });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = { writeHead: () => {}, end: () => {} };
  assert.equal(middleware(req, res), true);
});

test('http server health, metrics and protected route', async () => {
  const repository = { db: { query: async () => ({ rowCount: 1, rows: [{ order_id: '1', processed_at: 'now' }] }) } };
  const server = createHttpServer({
    auth: () => true,
    repository,
    metrics: { getPrometheusMetrics },
    logger: { error: () => {} },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const req = (path) => new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = ''; res.on('data', (d) => body += d); res.on('end', () => resolve({ status: res.statusCode, body }));
    });
  });

  assert.equal((await req('/health')).status, 200);
  assert.equal((await req('/metrics')).status, 200);
  assert.equal((await req('/orders/1')).status, 200);
  server.close();
});

test('rabbit client handles retries and dlq flow', async () => {
  const ops = { publish: [], ack: 0 };
  let consumer;
  const channel = {
    assertExchange: async () => {}, assertQueue: async () => {}, bindQueue: async () => {}, prefetch: async () => {},
    consume: async (_, cb) => { consumer = cb; },
    publish: (...args) => ops.publish.push(args),
    ack: () => { ops.ack += 1; },
  };
  const amqpModule = { default: { connect: async () => ({ createChannel: async () => channel }) } };
  const client = new RabbitMqClient({
    config: { rabbitmqUrl: 'amqp://x', exchange: 'e', retryExchange: 're', deadLetterExchange: 'de', queue: 'q', retryQueue: 'rq', deadLetterQueue: 'dq', routingKey: 'rk', retryDelayMs: 10, retryAttempts: 1 },
    logger: { error: () => {} },
    metrics: { inc: () => {} },
    amqpModule,
  });
  await client.connect();
  await client.consume(async () => { throw new Error('fail'); });

  await consumer({ content: Buffer.from('{"orderId":"1"}'), properties: { headers: { 'x-retry-count': 0 } } });
  await consumer({ content: Buffer.from('{"orderId":"1"}'), properties: { headers: { 'x-retry-count': 1 } } });
  assert.equal(ops.ack, 2);
  assert.equal(ops.publish.length, 2);
});

test('rabbit client propagates broker error at connect', async () => {
  const amqpModule = { default: { connect: async () => { throw new Error('broker down'); } } };
  const client = new RabbitMqClient({
    config: { rabbitmqUrl: 'amqp://x' }, logger: { error: () => {} }, metrics: { inc: () => {} }, amqpModule,
  });
  await assert.rejects(() => client.connect(), /broker down/);
});

test('auth middleware rejects missing and invalid token', () => {
  const middleware = authMiddleware({ jwtSecret: 'secret', logger: { error: () => {} } });
  let status = 0;
  const res = { writeHead: (s) => { status = s; }, end: () => {} };
  assert.equal(middleware({ headers: {} }, res), false);
  assert.equal(status, 401);

  status = 0;
  assert.equal(middleware({ headers: { authorization: 'Bearer bad.token.sig' } }, res), false);
  assert.equal(status, 401);
});

test('orders controller not found and server 500 paths', async () => {
  const repositoryNotFound = { db: { query: async () => ({ rowCount: 0, rows: [] }) } };
  const server1 = createHttpServer({ auth: () => true, repository: repositoryNotFound, metrics: { getPrometheusMetrics }, logger: { error: () => {} } });
  await new Promise((resolve) => server1.listen(0, resolve));
  const port1 = server1.address().port;
  const r1 = await new Promise((resolve) => http.get(`http://127.0.0.1:${port1}/orders/x`, (res) => resolve(res.statusCode)));
  assert.equal(r1, 404);
  server1.close();

  const repositoryError = { db: { query: async () => { throw new Error('db'); } } };
  const server2 = createHttpServer({ auth: () => true, repository: repositoryError, metrics: { getPrometheusMetrics }, logger: { error: () => {} } });
  await new Promise((resolve) => server2.listen(0, resolve));
  const port2 = server2.address().port;
  const r2 = await new Promise((resolve) => http.get(`http://127.0.0.1:${port2}/orders/x`, (res) => resolve(res.statusCode)));
  assert.equal(r2, 500);
  const r3 = await new Promise((resolve) => http.get(`http://127.0.0.1:${port2}/unknown`, (res) => resolve(res.statusCode)));
  assert.equal(r3, 404);
  server2.close();
});

test('postgres client commit and close', async () => {
  const client = {
    async query() { return {}; },
    release() {},
  };
  let ended = false;
  const pool = {
    query: async () => ({}),
    connect: async () => client,
    end: async () => { ended = true; },
  };
  const pgModule = { default: { Pool: class { constructor() { return pool; } } } };
  const pg = new PostgresClient({ connectionString: 'postgres://x', pgModule });
  await pg.connect();
  const out = await pg.withTransaction(async () => 'ok');
  assert.equal(out, 'ok');
  await pg.close();
  assert.equal(ended, true);
});

import { bootstrap } from '../src/bootstrap.js';
import { logger } from '../src/infra/observability/logger.js';

test('bootstrap fails fast when env missing', async () => {
  const saved = { ...process.env };
  delete process.env.PORT;
  delete process.env.RABBITMQ_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.JWT_SECRET;
  delete process.env.RETRY_ATTEMPTS;
  delete process.env.RETRY_DELAY_MS;
  await assert.rejects(() => bootstrap(), /Missing required environment variables/);
  process.env = saved;
});

test('logger error path', () => {
  logger.error({ a: 1 }, 'x');
  assert.ok(true);
});
