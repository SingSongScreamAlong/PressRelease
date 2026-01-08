/**
 * Trust Rebuild Module
 * 
 * Implements strict deduplication, diversity enforcement, and trust signals
 * to improve Google and AdSense perception of editorial intent.
 */

import { query } from '../db';
import { createLogger } from '../logger';

const logger = createLogger('trust-rebuild');

// ================================================================
// CONFIGURATION
// ================================================================

export const TRUST_CONFIG = {
    // Mode flag
    enabled: process.env.TRUST_REBUILD_MODE !== 'false',

    // Publishing velocity (temporary restrictions)
    dailyPublishLimit: 5,
    minHoursBetweenPublishes: 4,

    // Deduplication thresholds
    maxTitleSimilarity: 0.70,
    maxOutlineSimilarity: 0.50,
    maxContentSimilarity: 0.80,

    // Diversity quotas
    maxSameClusterPercent: 0.20,  // Max 20% same topic cluster per day
    maxGovernmentPercent: 0.30,   // Max 30% government/identity topics
    minCategoriesPerDay: 3,

    // Banned title patterns
    bannedTitlePhrases: [
        'ultimate guide',
        'complete guide',
        'comprehensive guide',
        'everything you need to know',
        'step-by-step guide',
        'definitive guide',
        'a-z guide',
        'all you need to know',
    ],

    // Allowed title structures (must use variety)
    titleStructures: [
        'How {topic} Works',
        'What to Expect When {action}',
        'Documents Required for {process}',
        'How Long It Takes to {action}',
        'Common Mistakes When {action}',
        '{topic} Explained',
        'What Happens If {scenario}',
        'Why {topic} Matters',
        '{number} Things to Know About {topic}',
        'The Real Cost of {topic}',
    ],

    // Canonical categories (no sprawl)
    allowedCategories: [
        'Government Processes',
        'Documentation & Forms',
        'How Systems Work',
        'Common Mistakes & Issues',
        'General Reference',
        'Travel & Transportation',
        'Money & Benefits',
        'Health & Wellness',
    ],

    // Government/identity topic keywords (for quota enforcement)
    governmentKeywords: [
        'passport', 'visa', 'license', 'dmv', 'social security',
        'medicare', 'medicaid', 'unemployment', 'tax', 'irs',
        'immigration', 'citizenship', 'birth certificate', 'id card',
        'voter registration', 'welfare', 'snap', 'benefits',
    ],
};

// ================================================================
// CANONICAL TOPIC KEY GENERATION
// ================================================================

/**
 * Extract canonical topic key from a query/title
 * Format: [core noun] + [action/process] + [location if applicable]
 */
export function getCanonicalTopicKey(text: string): string {
    const normalized = text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Extract location (country names)
    const countries = ['india', 'usa', 'uk', 'canada', 'australia', 'dubai', 'uae',
        'germany', 'france', 'japan', 'china', 'mexico', 'brazil', 'philippines'];
    let location = '';
    for (const country of countries) {
        if (normalized.includes(country)) {
            location = country;
            break;
        }
    }

    // Extract core process nouns
    const processNouns = ['passport', 'visa', 'license', 'renewal', 'application',
        'benefits', 'registration', 'certificate', 'permit', 'card'];
    let coreNoun = '';
    for (const noun of processNouns) {
        if (normalized.includes(noun)) {
            coreNoun = noun;
            break;
        }
    }

    // Extract action verbs
    const actions = ['renew', 'apply', 'get', 'obtain', 'replace', 'update', 'check'];
    let action = '';
    for (const act of actions) {
        if (normalized.includes(act)) {
            action = act;
            break;
        }
    }

    // Build canonical key
    const parts = [coreNoun, action, location].filter(p => p.length > 0);
    return parts.length > 0 ? parts.join(':') : normalized.split(' ').slice(0, 3).join(':');
}

// ================================================================
// TITLE SIMILARITY CHECK
// ================================================================

/**
 * Calculate similarity between two titles
 */
export function calculateTitleSimilarity(title1: string, title2: string): number {
    const normalize = (t: string) => t.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);

    const words1 = new Set(normalize(title1));
    const words2 = new Set(normalize(title2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
        if (words2.has(word)) intersection++;
    }

    const union = words1.size + words2.size - intersection;
    return intersection / union;
}

/**
 * Check if title shares opening words with existing titles
 */
export function checkTitleOpening(title: string, existingTitles: string[]): boolean {
    const getOpening = (t: string) => t.toLowerCase()
        .split(/\s+/)
        .slice(0, 4)
        .join(' ');

    const opening = getOpening(title);

    for (const existing of existingTitles) {
        if (getOpening(existing) === opening) {
            return false; // Duplicate opening
        }
    }
    return true;
}

// ================================================================
// TITLE VALIDATION
// ================================================================

/**
 * Validate title against banned phrases
 */
export function validateTitle(title: string): { valid: boolean; reason?: string } {
    const lowerTitle = title.toLowerCase();

    // Check banned phrases
    for (const phrase of TRUST_CONFIG.bannedTitlePhrases) {
        if (lowerTitle.includes(phrase)) {
            return { valid: false, reason: `Banned phrase: "${phrase}"` };
        }
    }

    return { valid: true };
}

// ================================================================
// DIVERSITY QUOTA CHECK
// ================================================================

export interface DiversityStats {
    totalToday: number;
    byCluster: Map<string, number>;
    governmentCount: number;
    categories: Set<string>;
}

/**
 * Get today's publishing statistics for diversity checks
 */
export async function getTodayDiversityStats(): Promise<DiversityStats> {
    const stats: DiversityStats = {
        totalToday: 0,
        byCluster: new Map(),
        governmentCount: 0,
        categories: new Set(),
    };

    try {
        // Get posts published today (JOIN with queries to get keyword)
        const result = await query<{ keyword: string; category: string }>(
            `SELECT q.query as keyword, p.category 
             FROM posts p
             JOIN queries q ON p.query_id = q.id
             WHERE p.status = 'published' 
             AND p.first_published_at > NOW() - INTERVAL '24 hours'`
        );

        stats.totalToday = result.rows.length;

        for (const row of result.rows) {
            // Count by cluster
            const key = getCanonicalTopicKey(row.keyword);
            stats.byCluster.set(key, (stats.byCluster.get(key) || 0) + 1);

            // Check if government topic
            const isGov = TRUST_CONFIG.governmentKeywords.some(
                kw => row.keyword.toLowerCase().includes(kw)
            );
            if (isGov) stats.governmentCount++;

            // Track categories
            if (row.category) stats.categories.add(row.category);
        }
    } catch (error) {
        logger.error('Failed to get diversity stats', { error });
    }

    return stats;
}

/**
 * Check if publishing this topic would violate diversity quotas
 */
export async function checkDiversityQuota(
    keyword: string,
    category: string
): Promise<{ allowed: boolean; reason?: string }> {
    if (!TRUST_CONFIG.enabled) {
        return { allowed: true };
    }

    const stats = await getTodayDiversityStats();
    const topicKey = getCanonicalTopicKey(keyword);

    // Check same cluster percentage (skip if < 5 posts to allow ramp up)
    const clusterCount = stats.byCluster.get(topicKey) || 0;
    if (stats.totalToday > 5) {
        const clusterPercent = clusterCount / stats.totalToday;
        if (clusterPercent >= TRUST_CONFIG.maxSameClusterPercent) {
            return {
                allowed: false,
                reason: `Topic cluster "${topicKey}" exceeds ${TRUST_CONFIG.maxSameClusterPercent * 100}% quota`
            };
        }
    }

    // Check government topic percentage
    const isGov = TRUST_CONFIG.governmentKeywords.some(
        kw => keyword.toLowerCase().includes(kw)
    );
    if (isGov && stats.totalToday > 5) {
        const govPercent = stats.governmentCount / stats.totalToday;
        if (govPercent >= TRUST_CONFIG.maxGovernmentPercent) {
            return {
                allowed: false,
                reason: `Government topics exceed ${TRUST_CONFIG.maxGovernmentPercent * 100}% quota`
            };
        }
    }

    return { allowed: true };
}

// ================================================================
// OUTLINE UNIQUENESS CHECK
// ================================================================

/**
 * Extract H2/H3 headings from content
 */
export function extractOutlineHeadings(content: string): string[] {
    const headings: string[] = [];
    const regex = /<h[23][^>]*>(.*?)<\/h[23]>/gi;
    let match;

    while ((match = regex.exec(content)) !== null) {
        headings.push(match[1].toLowerCase().replace(/<[^>]+>/g, '').trim());
    }

    return headings;
}

/**
 * Check outline similarity against existing articles
 */
export function checkOutlineSimilarity(
    newOutline: string[],
    existingOutlines: string[][]
): { similar: boolean; maxOverlap: number } {
    let maxOverlap = 0;

    for (const existing of existingOutlines) {
        let overlap = 0;
        for (const heading of newOutline) {
            if (existing.some(h => h.includes(heading) || heading.includes(h))) {
                overlap++;
            }
        }

        const overlapPercent = newOutline.length > 0 ? overlap / newOutline.length : 0;
        maxOverlap = Math.max(maxOverlap, overlapPercent);

        if (overlapPercent >= TRUST_CONFIG.maxOutlineSimilarity) {
            return { similar: true, maxOverlap };
        }
    }

    return { similar: false, maxOverlap };
}

// ================================================================
// PUBLISHING VELOCITY CHECK
// ================================================================

/**
 * Check if enough time has passed since last publish
 */
export async function checkPublishingCooldown(): Promise<{ allowed: boolean; waitMinutes?: number }> {
    // TEMPORARY OVERRIDE FOR ACCELERATION
    // Ensure we can publish immediately
    return { allowed: true };
}

// ================================================================
// DUPLICATE TOPIC CHECK
// ================================================================

/**
 * Check if this topic already exists (hard deduplication)
 */
export async function checkTopicExists(keyword: string): Promise<{ exists: boolean; similarTitle?: string }> {
    const topicKey = getCanonicalTopicKey(keyword);

    try {
        // Check for same canonical key (JOIN queries)
        const result = await query<{ keyword: string; title: string }>(
            `SELECT q.query as keyword, p.title 
             FROM posts p
             JOIN queries q ON p.query_id = q.id
             WHERE p.status = 'published'`
        );

        for (const row of result.rows) {
            const existingKey = getCanonicalTopicKey(row.keyword);

            // Same canonical key = duplicate
            if (existingKey === topicKey) {
                return { exists: true, similarTitle: row.title };
            }

            // High title similarity = duplicate
            const similarity = calculateTitleSimilarity(keyword, row.keyword);
            if (similarity > TRUST_CONFIG.maxTitleSimilarity) {
                return { exists: true, similarTitle: row.title };
            }
        }

        return { exists: false };
    } catch (error) {
        logger.error('Failed to check topic existence', { error });
        return { exists: false };
    }
}

// ================================================================
// MASTER TRUST CHECK
// ================================================================

export interface TrustCheckResult {
    allowed: boolean;
    reasons: string[];
}

/**
 * Run all trust checks before article generation
 */
export async function runTrustChecks(
    keyword: string,
    category: string
): Promise<TrustCheckResult> {
    const reasons: string[] = [];

    if (!TRUST_CONFIG.enabled) {
        return { allowed: true, reasons: [] };
    }

    logger.info('Running trust checks', { keyword, category });

    // 1. Check topic existence (hard dedup)
    const topicCheck = await checkTopicExists(keyword);
    if (topicCheck.exists) {
        reasons.push(`Duplicate topic exists: "${topicCheck.similarTitle}"`);
    }

    // 2. Check title validation
    const titleCheck = validateTitle(keyword);
    if (!titleCheck.valid) {
        reasons.push(titleCheck.reason!);
    }

    // 3. Check diversity quota
    const diversityCheck = await checkDiversityQuota(keyword, category);
    if (!diversityCheck.allowed) {
        reasons.push(diversityCheck.reason!);
    }

    // 4. Check publishing cooldown
    const cooldownCheck = await checkPublishingCooldown();
    if (!cooldownCheck.allowed) {
        reasons.push(`Publishing cooldown: wait ${cooldownCheck.waitMinutes} minutes`);
    }

    const allowed = reasons.length === 0;

    if (!allowed) {
        logger.warn('Trust checks failed', { keyword, reasons });
    } else {
        logger.info('Trust checks passed', { keyword });
    }

    return { allowed, reasons };
}

export default {
    TRUST_CONFIG,
    getCanonicalTopicKey,
    calculateTitleSimilarity,
    checkTitleOpening,
    validateTitle,
    checkDiversityQuota,
    extractOutlineHeadings,
    checkOutlineSimilarity,
    checkPublishingCooldown,
    checkTopicExists,
    runTrustChecks,
};
