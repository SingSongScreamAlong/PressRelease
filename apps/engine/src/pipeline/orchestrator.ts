/**
 * Pipeline Orchestrator
 * 
 * Coordinates the full content pipeline from discovery to publishing.
 * Now integrates with Strategy Engine for trend-based topic discovery.
 */

import { v4 as uuid } from 'uuid';
import config from '../config';
import { query, withTransaction } from '../db';
import { createLogger } from '../logger';
import { googleAutocompleteProvider } from '../providers/demand';
import { ScoredQuery, PipelineJob } from './types';
import { scoreQuery, getPublishableQueries } from './score';
import { generateOutline, validateOutline } from './outline';
import { generateArticle } from './generate';
import { runQualityGate } from './qualityGate';
import { publishArticle, checkPublishLimit } from './publish';
import { runRefreshLoop } from './refresh';
import { runTrustChecks, TRUST_CONFIG, checkPublishingCooldown } from './trustRebuild';

// Strategy Engine integration
import { runStrategyCycle, getNextTopic, ContentPlan } from '../strategy';

const logger = createLogger('orchestrator');

/**
 * Create a new job record
 */
async function createJob(
    jobType: PipelineJob['jobType'],
    metadata: Record<string, unknown> = {}
): Promise<string> {
    const jobId = uuid();
    await query(
        `INSERT INTO jobs (id, job_type, status, metadata, started_at)
     VALUES ($1, $2, 'running', $3, NOW())`,
        [jobId, jobType, JSON.stringify(metadata)]
    );
    return jobId;
}

/**
 * Update job status
 */
async function updateJob(
    jobId: string,
    updates: Partial<PipelineJob>
): Promise<void> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
    }
    if (updates.itemsProcessed !== undefined) {
        setClauses.push(`items_processed = $${paramIndex++}`);
        values.push(updates.itemsProcessed);
    }
    if (updates.itemsSucceeded !== undefined) {
        setClauses.push(`items_succeeded = $${paramIndex++}`);
        values.push(updates.itemsSucceeded);
    }
    if (updates.itemsFailed !== undefined) {
        setClauses.push(`items_failed = $${paramIndex++}`);
        values.push(updates.itemsFailed);
    }
    if (updates.status === 'completed' || updates.status === 'failed') {
        setClauses.push(`completed_at = NOW()`);
    }
    if (updates.errorMessage !== undefined) {
        setClauses.push(`error_message = $${paramIndex++}`);
        values.push(updates.errorMessage);
    }

    values.push(jobId);
    await query(
        `UPDATE jobs SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
        values
    );
}

/**
 * Run the discovery phase
 */
async function runDiscovery(): Promise<ScoredQuery[]> {
    const jobId = await createJob('discover');
    logger.info('Starting discovery phase', { jobId });

    try {
        // Get active keywords
        const keywordsResult = await query<{ id: string; keyword: string }>(
            `SELECT id, keyword FROM keywords WHERE is_active = true ORDER BY priority DESC LIMIT 10`
        );

        const allQueries: ScoredQuery[] = [];

        for (const { id: keywordId, keyword } of keywordsResult.rows) {
            logger.info('Discovering for keyword', { keyword });

            // Fetch suggestions
            const suggestions = await googleAutocompleteProvider.discover(keyword);

            for (const suggestion of suggestions) {
                // Score the query
                const scored = scoreQuery(suggestion.query, keywordId);

                // Skip if blocked or already exists
                if (scored.status === 'rejected') continue;

                // Check if already in database
                const existing = await query(
                    `SELECT id FROM queries WHERE normalized_query = $1`,
                    [scored.normalizedQuery]
                );

                if (existing.rows.length === 0) {
                    // Save to database
                    const queryId = uuid();
                    await query(
                        `INSERT INTO queries (
              id, keyword_id, query, normalized_query,
              intent_score, evergreen_score, ymyl_risk_score, combined_score,
              is_ymyl, ymyl_category, status, review_notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                        [
                            queryId, keywordId, scored.query, scored.normalizedQuery,
                            scored.intentScore, scored.evergreenScore,
                            scored.ymylRiskScore, scored.combinedScore,
                            scored.isYmyl, scored.ymylCategory,
                            scored.status, scored.reviewNotes
                        ]
                    );

                    scored.id = queryId;
                    allQueries.push(scored);
                }
            }

            // Rate limiting between keywords
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await updateJob(jobId, {
            status: 'completed',
            itemsProcessed: keywordsResult.rows.length,
            itemsSucceeded: allQueries.length,
        });

        logger.info('Discovery completed', {
            keywords: keywordsResult.rows.length,
            queriesFound: allQueries.length
        });

        return allQueries;
    } catch (error) {
        await updateJob(jobId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}

/**
 * Run the content generation and publishing phase
 */
async function runGeneration(): Promise<number> {
    // Check daily limit
    if (await checkPublishLimit()) {
        logger.info('Daily publish limit reached, skipping generation');
        return 0;
    }

    const jobId = await createJob('generate');
    logger.info('Starting generation phase', { jobId });

    try {
        // Get pending queries
        const result = await query<ScoredQuery>(
            `SELECT * FROM queries 
       WHERE status IN ('pending', 'approved')
       ORDER BY combined_score DESC
       LIMIT $1`,
            [config.publishing.dailyLimit]
        );

        const queries = result.rows;
        let succeeded = 0;
        let failed = 0;

        for (const scoredQuery of queries) {
            try {
                // Re-check limit
                if (await checkPublishLimit()) break;

                logger.info('Processing query', { query: scoredQuery.query });

                // TRUST REBUILD: Run trust checks before generation
                if (TRUST_CONFIG.enabled) {
                    const trustResult = await runTrustChecks(
                        scoredQuery.query,
                        scoredQuery.topicCategory || 'General Reference'
                    );

                    if (!trustResult.allowed) {
                        logger.warn('Trust checks failed, skipping', {
                            query: scoredQuery.query,
                            reasons: trustResult.reasons
                        });

                        // Mark as rejected in DB
                        await query(
                            `UPDATE queries SET status = 'rejected', review_notes = $1 WHERE id = $2`,
                            [trustResult.reasons.join('; '), scoredQuery.id]
                        );

                        failed++;
                        continue;
                    }
                }

                // Generate outline
                const outline = await generateOutline(scoredQuery);
                if (!validateOutline(outline)) {
                    logger.warn('Invalid outline, skipping', { query: scoredQuery.query });
                    failed++;
                    continue;
                }

                // Generate article
                const article = await generateArticle(scoredQuery, outline);

                // Run quality gate
                const qualityResult = runQualityGate(article);
                if (!qualityResult.passed) {
                    logger.warn('Quality gate failed', {
                        query: scoredQuery.query,
                        issues: qualityResult.issues
                    });
                    failed++;
                    continue;
                }

                // Publish
                await publishArticle(
                    scoredQuery,
                    article,
                    scoredQuery.topicCategory
                );

                succeeded++;

                // TRUST REBUILD: Extended delay between publications
                const delayMs = TRUST_CONFIG.enabled
                    ? TRUST_CONFIG.minHoursBetweenPublishes * 60 * 60 * 1000 / 4 // 1 hour between publishes in trust mode
                    : 3000;

                if (delayMs > 10000) {
                    logger.info('Trust Rebuild: Pausing transmission to mimic human rhythm', {
                        delayMinutes: Math.round(delayMs / 60000),
                        nextActionAt: new Date(Date.now() + delayMs).toISOString()
                    });
                }

                await new Promise(resolve => setTimeout(resolve, delayMs));

                if (delayMs > 10000) {
                    logger.info('Resuming after trust delay');
                }
            } catch (error) {
                logger.error('Failed to process query', {
                    query: scoredQuery.query,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
                failed++;
            }
        }

        await updateJob(jobId, {
            status: 'completed',
            itemsProcessed: queries.length,
            itemsSucceeded: succeeded,
            itemsFailed: failed,
        });

        logger.info('Generation completed', { succeeded, failed });
        return succeeded;
    } catch (error) {
        await updateJob(jobId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}

/**
 * Run strategy-driven discovery
 * Fetches trending topics and news, adds them as keywords for discovery
 */
async function runStrategyDiscovery(): Promise<number> {
    const jobId = await createJob('strategy');
    logger.info('Starting strategy discovery', { jobId });

    try {
        // Run the strategy cycle to get prioritized topics
        const plans = await runStrategyCycle({
            enableTrends: true,
            enableNews: true,
            maxPlansPerCycle: 10,
        });

        let added = 0;

        for (const plan of plans) {
            // Check if keyword already exists
            const existing = await query(
                `SELECT id FROM keywords WHERE keyword = $1`,
                [plan.keyword]
            );

            if (existing.rows.length === 0) {
                // Add as new keyword
                await query(
                    `INSERT INTO keywords (keyword, category, priority, is_active)
                     VALUES ($1, $2, $3, true)`,
                    [plan.keyword, plan.source, plan.priority]
                );
                added++;

                logger.info('Added trending keyword', { keyword: plan.keyword, priority: plan.priority });
            }

            // Save to content_plans table
            await query(
                `INSERT INTO content_plans (keyword, priority, source, time_urgency, related_topics, notes, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                 ON CONFLICT DO NOTHING`,
                [
                    plan.keyword,
                    plan.priority,
                    plan.source,
                    plan.timeUrgency || 'evergreen',
                    JSON.stringify(plan.relatedTopics || []),
                    plan.notes || null
                ]
            );
        }

        await updateJob(jobId, {
            status: 'completed',
            itemsProcessed: plans.length,
            itemsSucceeded: added,
        });

        logger.info('Strategy discovery completed', { plans: plans.length, newKeywords: added });
        return added;
    } catch (error) {
        logger.warn('Strategy discovery failed, falling back to standard discovery', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        await updateJob(jobId, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        return 0;
    }
}

/**
 * Run the full pipeline with Strategy Engine integration
 */
export async function runPipeline(): Promise<void> {
    logger.info('Starting pipeline run');

    try {
        // Phase 0: Strategy Discovery (trend-driven topics)
        try {
            await runStrategyDiscovery();
        } catch (strategyError) {
            logger.warn('Strategy phase skipped', { error: strategyError });
        }

        // Phase 1: Standard Discovery (keyword-based)
        await runDiscovery();

        // Phase 2: Generation & Publishing
        const published = await runGeneration();

        // Phase 3: Refresh (if no new content published)
        if (published === 0) {
            await runRefreshLoop();
        }

        logger.info('Pipeline run completed');
    } catch (error) {
        logger.error('Pipeline run failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}

/**
 * Run discovery only
 */
export async function runDiscoveryOnly(): Promise<ScoredQuery[]> {
    return runDiscovery();
}

/**
 * Run generation only
 */
export async function runGenerationOnly(): Promise<number> {
    return runGeneration();
}

/**
 * Run strategy discovery only
 */
export async function runStrategyOnly(): Promise<number> {
    return runStrategyDiscovery();
}

export default { runPipeline, runDiscoveryOnly, runGenerationOnly, runStrategyOnly };
