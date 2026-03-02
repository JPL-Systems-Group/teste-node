const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry(fn, { retries, delayMs, logger, context = {} }) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.error({ ...context, attempt, error: error.message }, 'Falha ao processar mensagem');

      if (attempt < retries) {
        await wait(delayMs);
      }
    }
  }

  throw lastError;
}

module.exports = { withRetry, wait };
