const env = {
  port: Number(process.env.PORT || 3000),
  queueName: process.env.QUEUE_NAME || 'order.created',
  rabbitmqUrl: process.env.RABBITMQ_URL || null,
  retryLimit: Number(process.env.RETRY_LIMIT || 3),
  retryDelayMs: Number(process.env.RETRY_DELAY_MS || 200),
  useMockQueue: process.env.USE_MOCK_QUEUE === 'true' || !process.env.RABBITMQ_URL,
};

module.exports = { env };
