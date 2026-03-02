export const logger = {
  info(context = {}, message = 'info') {
    process.stdout.write(`${JSON.stringify({ level: 'info', message, service: 'order-processor', ...context })}\n`);
  },
  error(context = {}, message = 'error') {
    process.stdout.write(`${JSON.stringify({ level: 'error', message, service: 'order-processor', ...context })}\n`);
  },
};
