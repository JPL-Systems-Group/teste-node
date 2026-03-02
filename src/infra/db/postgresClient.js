import { logger } from '../observability/logger.js';

export class PostgresClient {
  constructor({ connectionString, pgModule }) {
    this.connectionString = connectionString;
    this.pgModule = pgModule;
    this.pool = null;
  }

  async connect() {
    const module = this.pgModule || await import('pg');
    const { Pool } = module.default || module;
    this.pool = new Pool({ connectionString: this.connectionString });
    await this.pool.query('SELECT 1');
    logger.info({}, 'PostgreSQL connected');
  }

  async query(text, params = []) {
    return this.pool.query(text, params);
  }

  async withTransaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}
