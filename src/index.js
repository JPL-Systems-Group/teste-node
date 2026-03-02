import { bootstrap } from './bootstrap.js';
import { logger } from './infra/observability/logger.js';

bootstrap().catch((error) => {
  logger.error({ error: error.message }, 'Fatal bootstrap error');
  process.exit(1);
});
