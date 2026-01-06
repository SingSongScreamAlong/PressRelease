/**
 * Pipeline Types
 * 
 * Shared type definitions for the content pipeline.
 */

import { ArticleOutline, GeneratedArticle } from '../providers/ai';

/**
 * Query status in the pipeline
 */
export type QueryStatus = 'pending' | 'approved' | 'rejected' | 'published' | 'review_required';

/**
 * YMYL (Your Money Your Life) category
 */
export type YmylCategory = 'health' | 'finance' | 'legal' | 'safety' | 'none';

/**
 * Discovered query with scoring
 */
export interface ScoredQuery {
    id?: string;
    query: string;
    normalizedQuery: string;
    keywordId?: string;

    // Scores
    intentScore: number;
    evergreenScore: number;
    ymylRiskScore: number;
    combinedScore: number;

    // Classification
    isYmyl: boolean;
    ymylCategory: YmylCategory;
    topicCategory?: string;

    // Status
    status: QueryStatus;
    reviewNotes?: string;
}

/**
 * Pipeline job record
 */
export interface PipelineJob {
    id: string;
    jobType: 'discover' | 'generate' | 'publish' | 'refresh';
    status: 'pending' | 'running' | 'completed' | 'failed';
    itemsProcessed: number;
    itemsSucceeded: number;
    itemsFailed: number;
    startedAt?: Date;
    completedAt?: Date;
    errorMessage?: string;
    metadata: Record<string, unknown>;
}

/**
 * Post record in database
 */
export interface PostRecord {
    id: string;
    queryId?: string;
    wpPostId?: number;
    slug: string;
    title: string;
    contentHash?: string;
    version: number;
    status: 'draft' | 'published' | 'archived';
    firstPublishedAt?: Date;
    lastPublishedAt?: Date;
    lastRefreshedAt?: Date;
    nextRefreshAt?: Date;
    wordCount?: number;
    headingCount?: number;
    hasFaq: boolean;
    hasSources: boolean;
    qualityScore?: number;
    category?: string;
    tags?: string[];
    metaDescription?: string;
}

/**
 * Quality gate result
 */
export interface QualityGateResult {
    passed: boolean;
    score: number;
    issues: string[];
    details: {
        hasH1: boolean;
        h2Count: number;
        hasFaq: boolean;
        hasSources: boolean;
        hasDisclaimer: boolean;
        wordCount: number;
        bannedPhrasesFound: string[];
        similarityScore?: number;
    };
}

/**
 * Pipeline context passed through steps
 */
export interface PipelineContext {
    jobId: string;
    query: ScoredQuery;
    outline?: ArticleOutline;
    article?: GeneratedArticle;
    qualityResult?: QualityGateResult;
    publishedPost?: PostRecord;
    errors: string[];
}
