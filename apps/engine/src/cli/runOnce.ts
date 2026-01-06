/**
 * Run Once CLI
 * 
 * Run a single pipeline cycle: discover → score → generate → publish
 * 
 * Usage: npm run run:once
 */

import { validateConfig } from '../config';
import { checkConnection, closePool } from '../db';
import { runPipeline } from '../pipeline';
import { getEngineStats } from '../storage/repo';
import { createLogger } from '../logger';

const logger = createLogger('run-once');

async function main(): Promise<void> {
    logger.info('Starting single pipeline run');

    try {
        // Validate configuration
        validateConfig();

        // Check database connection
        const connected = await checkConnection();
        if (!connected) {
            logger.error('Cannot connect to database');
            process.exit(1);
        }

        // Show current stats
        const statsBefore = await getEngineStats();
        logger.info('Current stats', {
            keywords: statsBefore.totalKeywords,
            pendingQueries: statsBefore.pendingQueries,
            publishedPosts: statsBefore.publishedPosts,
            todayPublished: statsBefore.todayPublished,
        });

        // Run the pipeline
        await runPipeline();

        // Show updated stats
        const statsAfter = await getEngineStats();
        logger.info('Updated stats', {
            keywords: statsAfter.totalKeywords,
            pendingQueries: statsAfter.pendingQueries,
            publishedPosts: statsAfter.publishedPosts,
            todayPublished: statsAfter.todayPublished,
            newPosts: statsAfter.publishedPosts - statsBefore.publishedPosts,
        });

        logger.info('Pipeline run completed successfully');
    } catch (error) {
        logger.error('Pipeline run failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        process.exit(1);
    } finally {
        await closePool();
    }
}

main()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
