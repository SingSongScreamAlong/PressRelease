/**
 * Database Migration Runner
 */

import fs from 'fs';
import path from 'path';
import { query, checkConnection, closePool } from '../db';
import { createLogger } from '../logger';

const logger = createLogger('migrate');

async function runMigrations(): Promise<void> {
    logger.info('Running database migrations');

    // Check connection
    const connected = await checkConnection();
    if (!connected) {
        logger.error('Cannot connect to database');
        process.exit(1);
    }

    try {
        // Create migrations tracking table
        await query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Get list of migration files
        const migrationsDir = path.join(__dirname, 'migrations');

        if (!fs.existsSync(migrationsDir)) {
            logger.info('No migrations directory found, skipping');
            return;
        }

        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            // Check if already applied
            const result = await query(
                `SELECT id FROM _migrations WHERE name = $1`,
                [file]
            );

            if (result.rows.length > 0) {
                logger.debug('Migration already applied', { file });
                continue;
            }

            // Read and execute migration
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

            logger.info('Applying migration', { file });
            await query(sql);

            // Record migration
            await query(
                `INSERT INTO _migrations (name) VALUES ($1)`,
                [file]
            );

            logger.info('Migration applied successfully', { file });
        }

        logger.info('All migrations completed');
    } catch (error) {
        logger.error('Migration failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    } finally {
        await closePool();
    }
}

// Run if called directly
runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
