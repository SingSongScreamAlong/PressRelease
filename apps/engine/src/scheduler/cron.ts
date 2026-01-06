import cron from 'node-cron';
import config from '../config';
import { createLogger } from '../logger';
import { runPipeline } from '../pipeline/orchestrator';

const logger = createLogger('scheduler');

let scheduledTask: cron.ScheduledTask | null = null;

/**
 * Start the cron scheduler
 */
export function startScheduler(): void {
    if (!config.scheduler.enabled) {
        logger.info('Scheduler disabled by configuration');
        return;
    }

    const schedule = config.scheduler.cronSchedule;

    if (!cron.validate(schedule)) {
        logger.error('Invalid cron schedule', { schedule });
        throw new Error(`Invalid cron schedule: ${schedule}`);
    }

    logger.info('Starting scheduler', { schedule });

    scheduledTask = cron.schedule(schedule, async () => {
        logger.info('Scheduled pipeline run starting');
        try {
            await runPipeline();
            logger.info('Scheduled pipeline run completed');
        } catch (error) {
            logger.error('Scheduled pipeline run failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });

    scheduledTask.start();
    logger.info('Scheduler started successfully');
}

/**
 * Stop the cron scheduler
 */
export function stopScheduler(): void {
    if (scheduledTask) {
        scheduledTask.stop();
        scheduledTask = null;
        logger.info('Scheduler stopped');
    }
}

/**
 * Run the pipeline immediately (for manual triggers)
 */
export async function runNow(): Promise<void> {
    logger.info('Manual pipeline run triggered');
    await runPipeline();
}

export default { startScheduler, stopScheduler, runNow };
