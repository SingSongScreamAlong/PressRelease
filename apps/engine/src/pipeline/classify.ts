/**
 * Query Classification
 * 
 * YMYL detection and topic guardrails for content safety.
 */

import { YmylCategory, QueryStatus } from './types';
import config from '../config';
import { createLogger } from '../logger';

const logger = createLogger('classify');

/**
 * Health-related keywords
 */
const HEALTH_KEYWORDS = [
    'symptoms', 'treatment', 'diagnosis', 'medication', 'disease', 'illness',
    'cancer', 'diabetes', 'heart', 'blood pressure', 'cholesterol', 'depression',
    'anxiety', 'prescription', 'doctor', 'hospital', 'surgery', 'vaccine',
    'dosage', 'side effects', 'overdose', 'pregnancy', 'fertility', 'mental health',
    'diet', 'weight loss', 'exercise', 'nutrition', 'supplement', 'cure',
];

/**
 * Finance-related keywords
 */
const FINANCE_KEYWORDS = [
    'invest', 'stock', 'crypto', 'bitcoin', 'retirement', '401k', 'ira',
    'mortgage', 'loan', 'credit score', 'debt', 'bankruptcy', 'tax',
    'insurance', 'social security', 'pension', 'dividend', 'trading',
    'forex', 'real estate investment', 'savings', 'interest rate',
];

/**
 * Legal-related keywords
 */
const LEGAL_KEYWORDS = [
    'lawsuit', 'sue', 'attorney', 'lawyer', 'court', 'legal advice',
    'custody', 'divorce', 'will', 'estate', 'contract', 'liability',
    'discrimination', 'harassment', 'criminal', 'arrest', 'bail',
    'immigration', 'visa', 'deportation', 'asylum', 'copyright', 'patent',
];

/**
 * Safety-related keywords
 */
const SAFETY_KEYWORDS = [
    'emergency', 'poison', 'overdose', 'suicide', 'self-harm', 'abuse',
    'violence', 'assault', 'weapon', 'dangerous', 'hazard', 'toxic',
    'explosion', 'fire safety', 'evacuation', 'first aid',
];

/**
 * Blocked topics (never generate content)
 */
const BLOCKED_TOPICS = [
    'suicide methods', 'how to make weapons', 'illegal drugs',
    'child exploitation', 'terrorism', 'hate speech',
];

/**
 * Classification result
 */
export interface ClassificationResult {
    isYmyl: boolean;
    ymylCategory: YmylCategory;
    ymylRiskScore: number;
    isBlocked: boolean;
    status: QueryStatus;
    reviewNotes?: string;
}

/**
 * Classify a query for YMYL and safety concerns
 */
export function classifyQuery(query: string): ClassificationResult {
    const lowerQuery = query.toLowerCase();

    // Check for blocked topics first
    for (const blocked of BLOCKED_TOPICS) {
        if (lowerQuery.includes(blocked)) {
            logger.warn('Blocked topic detected', { query, blocked });
            return {
                isYmyl: true,
                ymylCategory: 'safety',
                ymylRiskScore: 1.0,
                isBlocked: true,
                status: 'rejected',
                reviewNotes: `Blocked topic: ${blocked}`,
            };
        }
    }

    // Detect YMYL categories
    const healthScore = countMatches(lowerQuery, HEALTH_KEYWORDS);
    const financeScore = countMatches(lowerQuery, FINANCE_KEYWORDS);
    const legalScore = countMatches(lowerQuery, LEGAL_KEYWORDS);
    const safetyScore = countMatches(lowerQuery, SAFETY_KEYWORDS);

    const maxScore = Math.max(healthScore, financeScore, legalScore, safetyScore);
    const isYmyl = maxScore > 0;

    let ymylCategory: YmylCategory = 'none';
    if (maxScore === healthScore && healthScore > 0) ymylCategory = 'health';
    else if (maxScore === financeScore && financeScore > 0) ymylCategory = 'finance';
    else if (maxScore === legalScore && legalScore > 0) ymylCategory = 'legal';
    else if (maxScore === safetyScore && safetyScore > 0) ymylCategory = 'safety';

    // Calculate risk score (0-1)
    const ymylRiskScore = Math.min(1, maxScore * 0.3);

    // Determine status
    let status: QueryStatus = 'pending';
    let reviewNotes: string | undefined;

    if (config.safety.safeTopicsOnly && isYmyl) {
        status = 'rejected';
        reviewNotes = `YMYL topic (${ymylCategory}) blocked by SAFE_TOPICS_ONLY mode`;
        logger.info('YMYL query rejected in safe mode', { query, ymylCategory });
    } else if (isYmyl && ymylRiskScore >= config.safety.ymylThreshold) {
        status = 'review_required';
        reviewNotes = `High YMYL risk (${ymylCategory}): ${ymylRiskScore.toFixed(2)}`;
    }

    return {
        isYmyl,
        ymylCategory,
        ymylRiskScore,
        isBlocked: false,
        status,
        reviewNotes,
    };
}

/**
 * Count keyword matches in a query
 */
function countMatches(query: string, keywords: string[]): number {
    return keywords.filter(kw => query.includes(kw)).length;
}

/**
 * Check if a query is safe to process
 */
export function isSafeToProcess(query: string): boolean {
    const result = classifyQuery(query);
    return !result.isBlocked && result.status !== 'rejected';
}

export default { classifyQuery, isSafeToProcess };
