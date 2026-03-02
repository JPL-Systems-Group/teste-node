import { loadConfig } from './config.js';
import { logger } from './infra/observability/logger.js';
import * as metrics from './infra/observability/metrics.js';
import { PostgresClient } from './infra/db/postgresClient.js';
import { OrderRepository } from './infra/db/orderRepository.js';
import { OrderProcessor } from './domain/orderProcessor.js';
import { createOrderCreatedHandler } from './application/handleOrderCreated.js';
import { RabbitMqClient } from './infra/messaging/rabbitMqClient.js';
import { authMiddleware } from './interfaces/http/middleware/authMiddleware.js';
import { createHttpServer } from './interfaces/http/server.js';

export async function bootstrap() {
  const config = loadConfig();

  const db = new PostgresClient({ connectionString: config.postgresUrl });
  await db.connect();

  const repository = new OrderRepository({ db });
  await repository.migrate();

  const processor = new OrderProcessor({ repository, logger, metrics });
  const handler = createOrderCreatedHandler({ processor, logger, metrics });

  const mq = new RabbitMqClient({ config, logger, metrics });
  await mq.connect();
  await mq.consume(handler);

  const auth = authMiddleware({ jwtSecret: config.jwtSecret, logger });
  const server = createHttpServer({ auth, repository, metrics, logger });

  await new Promise((resolve) => server.listen(config.port, resolve));
  logger.info({ port: config.port }, 'Service started');

  return { server, mq, db };
}
