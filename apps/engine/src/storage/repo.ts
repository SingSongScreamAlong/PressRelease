/**
 * Storage Repository Helpers
 * 
 * Database access patterns for the engine.
 */

import { query } from '../db';
import { ScoredQuery, PostRecord, PipelineJob } from '../pipeline/types';
import { createLogger } from '../logger';

const logger = createLogger('repo');

// ============================================================================
// Keywords
// ============================================================================

export interface Keyword {
    id: string;
    keyword: string;
    category?: string;
    priority: number;
    isActive: boolean;
}

export async function getActiveKeywords(limit = 100): Promise<Keyword[]> {
    const result = await query<Keyword>(
        `SELECT id, keyword, category, priority, is_active as "isActive"
     FROM keywords
     WHERE is_active = true
     ORDER BY priority DESC
     LIMIT $1`,
        [limit]
    );
    return result.rows;
}

export async function createKeyword(
    keyword: string,
    category?: string,
    priority = 0
): Promise<Keyword> {
    const result = await query<Keyword>(
        `INSERT INTO keywords (keyword, category, priority)
     VALUES ($1, $2, $3)
     ON CONFLICT (keyword) DO UPDATE SET
       category = COALESCE(EXCLUDED.category, keywords.category),
       priority = GREATEST(EXCLUDED.priority, keywords.priority)
     RETURNING id, keyword, category, priority, is_active as "isActive"`,
        [keyword, category, priority]
    );
    return result.rows[0];
}

export async function bulkCreateKeywords(
    keywords: Array<{ keyword: string; category?: string; priority?: number }>
): Promise<number> {
    let created = 0;
    for (const kw of keywords) {
        try {
            await createKeyword(kw.keyword, kw.category, kw.priority || 0);
            created++;
        } catch (error) {
            logger.warn('Failed to create keyword', { keyword: kw.keyword });
        }
    }
    return created;
}

// ============================================================================
// Queries
// ============================================================================

export async function getPendingQueries(limit = 100): Promise<ScoredQuery[]> {
    const result = await query<ScoredQuery>(
        `SELECT 
      id, query, normalized_query as "normalizedQuery",
      keyword_id as "keywordId",
      intent_score as "intentScore",
      evergreen_score as "evergreenScore",
      ymyl_risk_score as "ymylRiskScore",
      combined_score as "combinedScore",
      is_ymyl as "isYmyl",
      ymyl_category as "ymylCategory",
      topic_category as "topicCategory",
      status, review_notes as "reviewNotes"
     FROM queries
     WHERE status IN ('pending', 'approved')
     ORDER BY combined_score DESC
     LIMIT $1`,
        [limit]
    );
    return result.rows;
}

export async function updateQueryStatus(
    queryId: string,
    status: string,
    reviewNotes?: string
): Promise<void> {
    await query(
        `UPDATE queries SET status = $1, review_notes = $2 WHERE id = $3`,
        [status, reviewNotes, queryId]
    );
}

// ============================================================================
// Posts
// ============================================================================

export async function getPublishedPosts(limit = 100): Promise<PostRecord[]> {
    const result = await query<PostRecord>(
        `SELECT * FROM posts WHERE status = 'published' ORDER BY first_published_at DESC LIMIT $1`,
        [limit]
    );
    return result.rows;
}

export async function getPostBySlug(slug: string): Promise<PostRecord | null> {
    const result = await query<PostRecord>(
        `SELECT * FROM posts WHERE slug = $1`,
        [slug]
    );
    return result.rows[0] || null;
}

export async function getPostContents(limit = 100): Promise<string[]> {
    // For duplication checking, we'd need to store content
    // For MVP, return empty (duplication check uses content hashes)
    return [];
}

// ============================================================================
// Jobs
// ============================================================================

export async function getRecentJobs(limit = 20): Promise<PipelineJob[]> {
    const result = await query<PipelineJob>(
        `SELECT 
      id, job_type as "jobType", status,
      items_processed as "itemsProcessed",
      items_succeeded as "itemsSucceeded",
      items_failed as "itemsFailed",
      started_at as "startedAt",
      completed_at as "completedAt",
      error_message as "errorMessage",
      metadata
     FROM jobs
     ORDER BY created_at DESC
     LIMIT $1`,
        [limit]
    );
    return result.rows;
}

// ============================================================================
// Stats
// ============================================================================

export interface EngineStats {
    totalKeywords: number;
    totalQueries: number;
    pendingQueries: number;
    publishedPosts: number;
    draftPosts: number;
    todayPublished: number;
}

export async function getEngineStats(): Promise<EngineStats> {
    const stats = await query<{
        totalKeywords: string;
        totalQueries: string;
        pendingQueries: string;
        publishedPosts: string;
        draftPosts: string;
        todayPublished: string;
    }>(`
    SELECT
      (SELECT COUNT(*) FROM keywords WHERE is_active = true) as "totalKeywords",
      (SELECT COUNT(*) FROM queries) as "totalQueries",
      (SELECT COUNT(*) FROM queries WHERE status IN ('pending', 'approved')) as "pendingQueries",
      (SELECT COUNT(*) FROM posts WHERE status = 'published') as "publishedPosts",
      (SELECT COUNT(*) FROM posts WHERE status = 'draft') as "draftPosts",
      (SELECT COUNT(*) FROM posts WHERE first_published_at >= NOW() - INTERVAL '24 hours') as "todayPublished"
  `);

    const row = stats.rows[0];
    return {
        totalKeywords: parseInt(row.totalKeywords, 10),
        totalQueries: parseInt(row.totalQueries, 10),
        pendingQueries: parseInt(row.pendingQueries, 10),
        publishedPosts: parseInt(row.publishedPosts, 10),
        draftPosts: parseInt(row.draftPosts, 10),
        todayPublished: parseInt(row.todayPublished, 10),
    };
}

export default {
    getActiveKeywords,
    createKeyword,
    bulkCreateKeywords,
    getPendingQueries,
    updateQueryStatus,
    getPublishedPosts,
    getPostBySlug,
    getPostContents,
    getRecentJobs,
    getEngineStats,
};
