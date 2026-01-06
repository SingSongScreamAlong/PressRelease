/**
 * Tests for classify.ts
 */

import { classifyQuery, isSafeToProcess } from '../src/pipeline/classify';

describe('classifyQuery', () => {
    describe('YMYL Detection', () => {
        it('should detect health-related queries', () => {
            const result = classifyQuery('what are the symptoms of diabetes');
            expect(result.isYmyl).toBe(true);
            expect(result.ymylCategory).toBe('health');
        });

        it('should detect finance-related queries', () => {
            const result = classifyQuery('how to invest in stocks');
            expect(result.isYmyl).toBe(true);
            expect(result.ymylCategory).toBe('finance');
        });

        it('should detect legal-related queries', () => {
            const result = classifyQuery('how to file a lawsuit');
            expect(result.isYmyl).toBe(true);
            expect(result.ymylCategory).toBe('legal');
        });

        it('should detect safety-related queries', () => {
            const result = classifyQuery('emergency first aid');
            expect(result.isYmyl).toBe(true);
            expect(result.ymylCategory).toBe('safety');
        });

        it('should return none for non-YMYL queries', () => {
            const result = classifyQuery('how to make pasta');
            expect(result.isYmyl).toBe(false);
            expect(result.ymylCategory).toBe('none');
        });
    });

    describe('Blocked Topics', () => {
        it('should block dangerous topics', () => {
            const result = classifyQuery('how to make weapons');
            expect(result.isBlocked).toBe(true);
            expect(result.status).toBe('rejected');
        });

        it('should block illegal content queries', () => {
            const result = classifyQuery('illegal drugs guide');
            expect(result.isBlocked).toBe(true);
        });
    });

    describe('Risk Scoring', () => {
        it('should calculate higher risk for multiple health keywords', () => {
            const single = classifyQuery('symptoms');
            const multiple = classifyQuery('symptoms treatment diagnosis');
            expect(multiple.ymylRiskScore).toBeGreaterThan(single.ymylRiskScore);
        });

        it('should return 0 risk for safe topics', () => {
            const result = classifyQuery('best hiking trails');
            expect(result.ymylRiskScore).toBe(0);
        });
    });
});

describe('isSafeToProcess', () => {
    it('should return true for safe queries', () => {
        expect(isSafeToProcess('how to cook rice')).toBe(true);
    });

    it('should return false for blocked queries', () => {
        expect(isSafeToProcess('terrorism guide')).toBe(false);
    });
});
