const requiredEnv = [
  'PORT',
  'RABBITMQ_URL',
  'POSTGRES_URL',
  'JWT_SECRET',
  'RETRY_ATTEMPTS',
  'RETRY_DELAY_MS',
];

export function loadConfig(env = process.env) {
  const missing = requiredEnv.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    port: Number(env.PORT),
    rabbitmqUrl: env.RABBITMQ_URL,
    postgresUrl: env.POSTGRES_URL,
    jwtSecret: env.JWT_SECRET,
    retryAttempts: Number(env.RETRY_ATTEMPTS),
    retryDelayMs: Number(env.RETRY_DELAY_MS),
    exchange: env.RABBITMQ_EXCHANGE || 'orders.exchange',
    retryExchange: env.RABBITMQ_RETRY_EXCHANGE || 'orders.exchange.retry',
    deadLetterExchange: env.RABBITMQ_DLX || 'orders.exchange.dlq',
    queue: env.RABBITMQ_QUEUE || 'orders.created.queue',
    routingKey: env.RABBITMQ_ROUTING_KEY || 'order.created',
    retryQueue: env.RABBITMQ_RETRY_QUEUE || 'orders.created.retry.queue',
    deadLetterQueue: env.RABBITMQ_DEAD_LETTER_QUEUE || 'orders.created.dlq',
  };
}
