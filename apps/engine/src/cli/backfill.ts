/**
 * Backfill CLI
 * 
 * Backfill operations for existing content.
 * 
 * Usage: 
 *   npm run backfill -- --action refresh      # Trigger refresh on all old posts
 *   npm run backfill -- --action discover     # Run discovery only
 *   npm run backfill -- --action stats        # Show engine statistics
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { checkConnection, closePool } from '../db';
import { runDiscoveryOnly, runRefreshLoop } from '../pipeline';
import { getEngineStats, getRecentJobs } from '../storage/repo';
import { createLogger } from '../logger';

const logger = createLogger('backfill');

type Action = 'refresh' | 'discover' | 'stats';

async function runStats(): Promise<void> {
    const stats = await getEngineStats();
    console.log('\n=== Engine Statistics ===');
    console.log(`Keywords (active):    ${stats.totalKeywords}`);
    console.log(`Total queries:        ${stats.totalQueries}`);
    console.log(`Pending queries:      ${stats.pendingQueries}`);
    console.log(`Published posts:      ${stats.publishedPosts}`);
    console.log(`Draft posts:          ${stats.draftPosts}`);
    console.log(`Published today:      ${stats.todayPublished}`);

    const recentJobs = await getRecentJobs(5);
    console.log('\n=== Recent Jobs ===');
    for (const job of recentJobs) {
        console.log(`  ${job.jobType}: ${job.status} (${job.itemsSucceeded}/${job.itemsProcessed})`);
    }
    console.log('');
}

async function main(): Promise<void> {
    const argv = await yargs(hideBin(process.argv))
        .option('action', {
            alias: 'a',
            type: 'string',
            choices: ['refresh', 'discover', 'stats'] as const,
            description: 'Action to perform',
            demandOption: true,
        })
        .help()
        .parse();

    const action = argv.action as Action;

    // Check database connection
    const connected = await checkConnection();
    if (!connected) {
        logger.error('Cannot connect to database');
        process.exit(1);
    }

    try {
        switch (action) {
            case 'stats':
                await runStats();
                break;

            case 'discover':
                logger.info('Running discovery backfill');
                const queries = await runDiscoveryOnly();
                logger.info('Discovery completed', { queriesFound: queries.length });
                break;

            case 'refresh':
                logger.info('Running refresh backfill');
                const result = await runRefreshLoop();
                logger.info('Refresh completed', {
                    processed: result.processed,
                    succeeded: result.succeeded,
                    failed: result.failed,
                });
                break;

            default:
                logger.error('Unknown action', { action });
                process.exit(1);
        }
    } catch (error) {
        logger.error('Backfill failed', {
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
