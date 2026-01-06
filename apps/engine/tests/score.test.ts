/**
 * Tests for score.ts
 */

import {
    normalizeQuery,
    calculateIntentScore,
    calculateEvergreenScore,
    calculateCombinedScore,
    scoreQuery,
} from '../src/pipeline/score';

describe('normalizeQuery', () => {
    it('should lowercase the query', () => {
        expect(normalizeQuery('HOW TO COOK')).toBe('how to cook');
    });

    it('should remove special characters', () => {
        expect(normalizeQuery('what is a "test"?')).toBe('what is a test');
    });

    it('should collapse whitespace', () => {
        expect(normalizeQuery('how   to    cook')).toBe('how to cook');
    });

    it('should trim whitespace', () => {
        expect(normalizeQuery('  test query  ')).toBe('test query');
    });
});

describe('calculateIntentScore', () => {
    it('should score question queries high', () => {
        expect(calculateIntentScore('how to apply')).toBeGreaterThanOrEqual(0.85);
        expect(calculateIntentScore('what is a widget')).toBeGreaterThanOrEqual(0.75);
        expect(calculateIntentScore('can I do something')).toBeGreaterThanOrEqual(0.9);
    });

    it('should score eligibility queries highest', () => {
        expect(calculateIntentScore('eligibility requirements')).toBeGreaterThanOrEqual(0.95);
        expect(calculateIntentScore('do I qualify for')).toBeGreaterThanOrEqual(0.95);
    });

    it('should give base score to generic queries', () => {
        const score = calculateIntentScore('random words here');
        expect(score).toBe(0.5);
    });
});

describe('calculateEvergreenScore', () => {
    it('should penalize temporal queries', () => {
        const temporal = calculateEvergreenScore('news today');
        const evergreen = calculateEvergreenScore('what is a passport');
        expect(evergreen).toBeGreaterThan(temporal);
    });

    it('should penalize year-specific queries', () => {
        const score = calculateEvergreenScore('best phones 2024');
        expect(score).toBeLessThan(0.5);
    });

    it('should score rules/policy queries high', () => {
        const score = calculateEvergreenScore('passport rules');
        expect(score).toBeGreaterThanOrEqual(0.9);
    });

    it('should score how-to queries well', () => {
        const score = calculateEvergreenScore('how to renew passport');
        expect(score).toBeGreaterThanOrEqual(0.85);
    });
});

describe('calculateCombinedScore', () => {
    it('should weight scores correctly', () => {
        const score = calculateCombinedScore(1.0, 1.0, 0.0);
        expect(score).toBe(1.0);
    });

    it('should penalize high YMYL risk', () => {
        const lowRisk = calculateCombinedScore(0.8, 0.8, 0.0);
        const highRisk = calculateCombinedScore(0.8, 0.8, 1.0);
        expect(lowRisk).toBeGreaterThan(highRisk);
    });

    it('should return value between 0 and 1', () => {
        const score = calculateCombinedScore(0.5, 0.5, 0.5);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
    });
});

describe('scoreQuery', () => {
    it('should return a fully populated ScoredQuery', () => {
        const result = scoreQuery('how to apply for passport');

        expect(result.query).toBe('how to apply for passport');
        expect(result.normalizedQuery).toBeDefined();
        expect(result.intentScore).toBeDefined();
        expect(result.evergreenScore).toBeDefined();
        expect(result.ymylRiskScore).toBeDefined();
        expect(result.combinedScore).toBeDefined();
        expect(result.status).toBeDefined();
    });

    it('should assign keywordId when provided', () => {
        const result = scoreQuery('test query', 'keyword-123');
        expect(result.keywordId).toBe('keyword-123');
    });
});
