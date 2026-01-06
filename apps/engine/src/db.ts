import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import config from './config';
import { createLogger } from './logger';

const logger = createLogger('db');

/**
 * PostgreSQL connection pool
 */
export const pool = new Pool({
    connectionString: config.database.url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Log pool events
pool.on('connect', () => {
    logger.debug('New database connection established');
});

pool.on('error', (err) => {
    logger.error('Unexpected database error', { error: err.message });
});

/**
 * Execute a query with automatic connection management
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
        const result = await pool.query<T>(text, params);
        const duration = Date.now() - start;
        logger.debug('Query executed', {
            duration: `${duration}ms`,
            rows: result.rowCount
        });
        return result;
    } catch (error) {
        logger.error('Query failed', {
            text: text.substring(0, 100),
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
    const client = await pool.connect();
    return client;
}

/**
 * Execute a function within a transaction
 */
export async function withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await getClient();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Check database connectivity
 */
export async function checkConnection(): Promise<boolean> {
    try {
        await query('SELECT 1');
        logger.info('Database connection verified');
        return true;
    } catch (error) {
        logger.error('Database connection failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return false;
    }
}

/**
 * Close all database connections
 */
export async function closePool(): Promise<void> {
    await pool.end();
    logger.info('Database pool closed');
}

export default { pool, query, getClient, withTransaction, checkConnection, closePool };
