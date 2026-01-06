/**
 * Tests for qualityGate.ts
 */

import {
    runQualityGate,
    calculateContentHash,
    calculateSimilarity,
} from '../src/pipeline/qualityGate';
import { GeneratedArticle } from '../src/providers/ai';

describe('runQualityGate', () => {
    const createArticle = (overrides: Partial<GeneratedArticle> = {}): GeneratedArticle => ({
        title: 'Test Article',
        metaDescription: 'A test article for quality gate testing',
        content: `
      <h1>Test Article</h1>
      <p>This is the introduction.</p>
      <h2>Section One</h2>
      <p>Content for section one.</p>
      <h2>Section Two</h2>
      <p>Content for section two.</p>
      <h2>Section Three</h2>
      <p>Content for section three.</p>
      <h2>Frequently Asked Questions</h2>
      <h3>Question 1?</h3>
      <p>Answer 1.</p>
      <div class="disclaimer">
        <h2>Disclaimer</h2>
        <p>This is for informational purposes only.</p>
      </div>
      <div class="sources">
        <h2>Sources</h2>
        <p>Reference materials.</p>
      </div>
    `,
        wordCount: 600,
        headings: ['Test Article', 'Section One', 'Section Two', 'Section Three', 'FAQ', 'Disclaimer', 'Sources'],
        hasFaq: true,
        hasSources: true,
        hasDisclaimer: true,
        ...overrides,
    });

    it('should pass a well-formed article', () => {
        const article = createArticle();
        const result = runQualityGate(article);

        expect(result.passed).toBe(true);
        expect(result.issues).toHaveLength(0);
        expect(result.details.hasH1).toBe(true);
        expect(result.details.h2Count).toBeGreaterThanOrEqual(3);
    });

    it('should fail if missing H1', () => {
        const article = createArticle({
            content: '<h2>No H1 Here</h2><p>Content</p>',
        });
        const result = runQualityGate(article);

        expect(result.passed).toBe(false);
        expect(result.issues).toContain('Missing H1 heading');
    });

    it('should fail if insufficient H2 headings', () => {
        const article = createArticle({
            content: `
        <h1>Title</h1>
        <h2>Only One Section</h2>
        <p>Content</p>
        <div class="disclaimer"><h2>Disclaimer</h2></div>
        <div class="sources"><h2>Sources</h2></div>
      `,
        });
        const result = runQualityGate(article);

        expect(result.passed).toBe(false);
        expect(result.issues.some(i => i.includes('Insufficient H2'))).toBe(true);
    });

    it('should fail if missing FAQ section', () => {
        const article = createArticle({
            content: `
        <h1>Title</h1>
        <h2>Section 1</h2>
        <h2>Section 2</h2>
        <h2>Section 3</h2>
        <div class="disclaimer"><h2>Disclaimer</h2></div>
        <div class="sources"><h2>Sources</h2></div>
      `,
        });
        const result = runQualityGate(article);

        expect(result.passed).toBe(false);
        expect(result.issues).toContain('Missing FAQ section');
    });

    it('should fail if missing disclaimer', () => {
        const article = createArticle({
            content: `
        <h1>Title</h1>
        <h2>Section 1</h2>
        <h2>Section 2</h2>
        <h2>Section 3</h2>
        <h2>FAQ</h2>
        <div class="sources"><h2>Sources</h2></div>
      `,
        });
        const result = runQualityGate(article);

        expect(result.passed).toBe(false);
        expect(result.issues).toContain('Missing Disclaimer section');
    });

    it('should fail if word count is too low', () => {
        const article = createArticle({ wordCount: 100 });
        const result = runQualityGate(article);

        expect(result.passed).toBe(false);
        expect(result.issues.some(i => i.includes('Insufficient word count'))).toBe(true);
    });

    it('should detect banned phrases', () => {
        const article = createArticle({
            content: `
        <h1>Title</h1>
        <p>As an expert in this field...</p>
        <h2>Section 1</h2>
        <h2>Section 2</h2>
        <h2>Section 3</h2>
        <h2>FAQ</h2>
        <div class="disclaimer"><h2>Disclaimer</h2></div>
        <div class="sources"><h2>Sources</h2></div>
      `,
        });
        const result = runQualityGate(article);

        expect(result.passed).toBe(false);
        expect(result.details.bannedPhrasesFound).toContain('as an expert');
    });
});

describe('calculateContentHash', () => {
    it('should return consistent hash for same content', () => {
        const hash1 = calculateContentHash('<p>Test content</p>');
        const hash2 = calculateContentHash('<p>Test content</p>');
        expect(hash1).toBe(hash2);
    });

    it('should return different hash for different content', () => {
        const hash1 = calculateContentHash('<p>Content A</p>');
        const hash2 = calculateContentHash('<p>Content B</p>');
        expect(hash1).not.toBe(hash2);
    });

    it('should ignore HTML tags', () => {
        const hash1 = calculateContentHash('<p>Test content</p>');
        const hash2 = calculateContentHash('<div>Test content</div>');
        expect(hash1).toBe(hash2);
    });
});

describe('calculateSimilarity', () => {
    it('should return 1 for identical content', () => {
        const content = 'This is a test article with several words';
        const similarity = calculateSimilarity(content, content);
        expect(similarity).toBe(1);
    });

    it('should return 0 for completely different content', () => {
        const content1 = 'apple banana cherry date elderberry';
        const content2 = 'zebra yellow xray whiskey violet';
        const similarity = calculateSimilarity(content1, content2);
        expect(similarity).toBe(0);
    });

    it('should return partial similarity for overlapping content', () => {
        const content1 = 'how to apply for a passport renewal';
        const content2 = 'how to apply for a drivers license';
        const similarity = calculateSimilarity(content1, content2);
        expect(similarity).toBeGreaterThan(0);
        expect(similarity).toBeLessThan(1);
    });
});
