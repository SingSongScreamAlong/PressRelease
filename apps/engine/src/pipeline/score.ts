/**
 * Query Scoring
 * 
 * Score queries for click intent, evergreen potential, and overall value.
 */

import { ScoredQuery, YmylCategory } from './types';
import { classifyQuery } from './classify';
import { createLogger } from '../logger';

const logger = createLogger('score');

/**
 * High-value intent patterns
 */
const INTENT_PATTERNS = {
    question: {
        patterns: [
            /^how (to|do|does|can|long|much|many)/i,
            /^what (is|are|does|do|happens)/i,
            /^why (do|does|is|are)/i,
            /^when (do|does|can|should|will)/i,
            /^where (can|do|does|is|are)/i,
            /^can (you|i|we|one)/i,
            /^is (it|there|this)/i,
        ],
        score: 0.9,
    },
    eligibility: {
        patterns: [
            /eligib(le|ility)/i,
            /qualify|qualificat/i,
            /requirements?/i,
            /criteria/i,
        ],
        score: 0.95,
    },
    process: {
        patterns: [
            /how to apply/i,
            /step.by.step/i,
            /process (for|to|of)/i,
            /deadline/i,
            /timeline/i,
        ],
        score: 0.85,
    },
    comparison: {
        patterns: [
            /vs\.?|versus/i,
            /difference between/i,
            /compared to/i,
            /better (than|or)/i,
        ],
        score: 0.8,
    },
    definition: {
        patterns: [
            /\bwhat is\b/i,
            /\bwhat are\b/i,
            /\bdefinition of\b/i,
            /\bmeaning of\b/i,
        ],
        score: 0.75,
    },
};

/**
 * Non-evergreen (news/trending) patterns to avoid
 */
const TEMPORAL_PATTERNS = [
    /\b(today|yesterday|tomorrow)\b/i,
    /\b(this week|last week|next week)\b/i,
    /\b20[2-9][0-9]\b/, // Years
    /\b(breaking|latest|news|update)\b/i,
    /\b(announced|released|launched) (today|yesterday)/i,
];

/**
 * Evergreen topic patterns
 */
const EVERGREEN_PATTERNS = {
    rules: {
        patterns: [/\brules?\b/i, /\bregulations?\b/i, /\bpolicy\b/i],
        score: 0.9,
    },
    howTo: {
        patterns: [/\bhow to\b/i, /\bsteps? to\b/i, /\bguide\b/i],
        score: 0.85,
    },
    general: {
        patterns: [/\bwhat is\b/i, /\bwhat are\b/i, /\bexplained\b/i],
        score: 0.8,
    },
};

/**
 * Normalize a query string
 */
export function normalizeQuery(query: string): string {
    return query
        .toLowerCase()
        .trim()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculate intent score for a query
 */
export function calculateIntentScore(query: string): number {
    let maxScore = 0.5; // Base score

    for (const category of Object.values(INTENT_PATTERNS)) {
        for (const pattern of category.patterns) {
            if (pattern.test(query)) {
                maxScore = Math.max(maxScore, category.score);
                break;
            }
        }
    }

    return maxScore;
}

/**
 * Calculate evergreen score for a query
 */
export function calculateEvergreenScore(query: string): number {
    // Check for temporal patterns (reduces score)
    let temporalPenalty = 0;
    for (const pattern of TEMPORAL_PATTERNS) {
        if (pattern.test(query)) {
            temporalPenalty += 0.2;
        }
    }

    let evergreenBonus = 0.5; // Base score

    // Check for evergreen patterns
    for (const category of Object.values(EVERGREEN_PATTERNS)) {
        for (const pattern of category.patterns) {
            if (pattern.test(query)) {
                evergreenBonus = Math.max(evergreenBonus, category.score);
                break;
            }
        }
    }

    return Math.max(0, Math.min(1, evergreenBonus - temporalPenalty));
}

/**
 * Calculate combined score
 */
export function calculateCombinedScore(
    intentScore: number,
    evergreenScore: number,
    ymylRiskScore: number
): number {
    // Weight: intent (40%), evergreen (40%), inverse YMYL risk (20%)
    const score =
        intentScore * 0.4 +
        evergreenScore * 0.4 +
        (1 - ymylRiskScore) * 0.2;

    return Math.round(score * 100) / 100;
}

/**
 * Score a query fully
 */
export function scoreQuery(query: string, keywordId?: string): ScoredQuery {
    const normalizedQuery = normalizeQuery(query);

    // Calculate individual scores
    const intentScore = calculateIntentScore(query);
    const evergreenScore = calculateEvergreenScore(query);

    // Get classification
    const classification = classifyQuery(query);

    // Calculate combined score
    const combinedScore = calculateCombinedScore(
        intentScore,
        evergreenScore,
        classification.ymylRiskScore
    );

    logger.debug('Query scored', {
        query: query.substring(0, 50),
        intentScore,
        evergreenScore,
        ymylRiskScore: classification.ymylRiskScore,
        combinedScore,
    });

    return {
        query,
        normalizedQuery,
        keywordId,
        intentScore,
        evergreenScore,
        ymylRiskScore: classification.ymylRiskScore,
        combinedScore,
        isYmyl: classification.isYmyl,
        ymylCategory: classification.ymylCategory,
        status: classification.status,
        reviewNotes: classification.reviewNotes,
    };
}

/**
 * Rank queries by combined score
 */
export function rankQueries(queries: ScoredQuery[]): ScoredQuery[] {
    return [...queries].sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Filter queries ready for publishing
 */
export function getPublishableQueries(
    queries: ScoredQuery[],
    limit: number
): ScoredQuery[] {
    return queries
        .filter(q => q.status === 'pending' || q.status === 'approved')
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, limit);
}

export default {
    normalizeQuery,
    scoreQuery,
    rankQueries,
    getPublishableQueries,
    calculateIntentScore,
    calculateEvergreenScore,
    calculateCombinedScore,
};
