/**
 * Quality Gate
 * 
 * Validate generated articles meet quality standards before publishing.
 */

import { GeneratedArticle } from '../providers/ai';
import { QualityGateResult } from './types';
import { BANNED_PHRASES } from '../providers/ai/prompts';
import config from '../config';
import { createLogger } from '../logger';

const logger = createLogger('quality-gate');

/**
 * Run quality checks on a generated article
 */
export function runQualityGate(article: GeneratedArticle): QualityGateResult {
    const issues: string[] = [];
    const content = article.content.toLowerCase();

    // Check H1
    const hasH1 = /<h1[^>]*>/.test(article.content);
    if (!hasH1) {
        issues.push('Missing H1 heading');
    }

    // Count H2 headings
    const h2Matches = article.content.match(/<h2[^>]*>/gi) || [];
    const h2Count = h2Matches.length;
    if (h2Count < config.quality.minHeadings) {
        issues.push(`Insufficient H2 headings: ${h2Count} (minimum: ${config.quality.minHeadings})`);
    }

    // Check FAQ section
    const hasFaq = content.includes('faq') ||
        content.includes('frequently asked questions');
    if (!hasFaq) {
        issues.push('Missing FAQ section');
    }

    // Check sources section
    const hasSources = content.includes('sources') ||
        content.includes('references');
    if (!hasSources) {
        issues.push('Missing Sources section');
    }

    // Check disclaimer
    const hasDisclaimer = content.includes('disclaimer');
    if (!hasDisclaimer) {
        issues.push('Missing Disclaimer section');
    }

    // Check word count
    const wordCount = article.wordCount;
    if (wordCount < config.quality.minWordCount) {
        issues.push(`Insufficient word count: ${wordCount} (minimum: ${config.quality.minWordCount})`);
    }

    // Check banned phrases
    const bannedPhrasesFound: string[] = [];
    for (const phrase of BANNED_PHRASES) {
        if (content.includes(phrase.toLowerCase())) {
            bannedPhrasesFound.push(phrase);
            issues.push(`Banned phrase found: "${phrase}"`);
        }
    }

    // Calculate quality score
    const totalChecks = 7;
    const passedChecks = totalChecks - issues.length + bannedPhrasesFound.length;
    const score = Math.max(0, passedChecks / totalChecks);

    const passed = issues.length === 0;

    const result: QualityGateResult = {
        passed,
        score,
        issues,
        details: {
            hasH1,
            h2Count,
            hasFaq,
            hasSources,
            hasDisclaimer,
            wordCount,
            bannedPhrasesFound,
        },
    };

    if (passed) {
        logger.info('Quality gate passed', { score, wordCount, h2Count });
    } else {
        logger.warn('Quality gate failed', { issues, score });
    }

    return result;
}

/**
 * Calculate content hash for deduplication
 */
export function calculateContentHash(content: string): string {
    // Simple hash based on normalized content
    const normalized = content
        .toLowerCase()
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Simple hash (for MVP; use crypto.createHash in production)
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        const char = normalized.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Calculate similarity between two content strings using shingles
 */
export function calculateSimilarity(content1: string, content2: string): number {
    const shingleSize = 3;

    const getShingles = (text: string): Set<string> => {
        const words = text
            .toLowerCase()
            .replace(/<[^>]+>/g, ' ')
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2);

        const shingles = new Set<string>();
        for (let i = 0; i <= words.length - shingleSize; i++) {
            shingles.add(words.slice(i, i + shingleSize).join(' '));
        }
        return shingles;
    };

    const shingles1 = getShingles(content1);
    const shingles2 = getShingles(content2);

    if (shingles1.size === 0 || shingles2.size === 0) {
        return 0;
    }

    // Jaccard similarity
    let intersection = 0;
    for (const shingle of shingles1) {
        if (shingles2.has(shingle)) {
            intersection++;
        }
    }

    const union = shingles1.size + shingles2.size - intersection;
    return intersection / union;
}

/**
 * Check if content is too similar to existing posts
 */
export async function checkDuplication(
    content: string,
    existingContents: string[]
): Promise<{ isDuplicate: boolean; maxSimilarity: number }> {
    let maxSimilarity = 0;

    for (const existing of existingContents) {
        const similarity = calculateSimilarity(content, existing);
        maxSimilarity = Math.max(maxSimilarity, similarity);

        if (similarity >= config.quality.maxSimilarity) {
            logger.warn('Duplicate content detected', { similarity });
            return { isDuplicate: true, maxSimilarity };
        }
    }

    return { isDuplicate: false, maxSimilarity };
}

export default {
    runQualityGate,
    calculateContentHash,
    calculateSimilarity,
    checkDuplication,
};
