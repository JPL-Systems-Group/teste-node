function log(level, context, message) {
  const payload = {
    level,
    service: 'order-processor',
    time: new Date().toISOString(),
    message,
    ...context,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const logger = {
  info: (context = {}, message = 'info') => log('info', context, message),
  error: (context = {}, message = 'error') => log('error', context, message),
  fatal: (context = {}, message = 'fatal') => log('fatal', context, message),
};

module.exports = { logger };
