import config, { validateConfig } from './config';
import { createLogger } from './logger';
import { checkConnection, closePool } from './db';
import { startScheduler, stopScheduler } from './scheduler/cron';

const logger = createLogger('main');

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}, shutting down...`);

    stopScheduler();
    await closePool();

    logger.info('Shutdown complete');
    process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    logger.info('ReadAllAboutIt Engine starting...', {
        nodeEnv: config.nodeEnv,
        publishMode: config.publishing.mode,
        dailyLimit: config.publishing.dailyLimit,
    });

    try {
        // Validate configuration
        validateConfig();
        logger.info('Configuration validated');

        // Check database connection
        const dbConnected = await checkConnection();
        if (!dbConnected) {
            throw new Error('Failed to connect to database');
        }

        // Start the scheduler
        startScheduler();

        logger.info('Engine is running. Press Ctrl+C to stop.');
    } catch (error) {
        logger.error('Startup failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        process.exit(1);
    }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
});

// Start the engine
main();
