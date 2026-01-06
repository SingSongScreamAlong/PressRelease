/**
 * Article Generation
 * 
 * Generate full articles from outlines using AI.
 */

import { ArticleOutline, GeneratedArticle } from '../providers/ai';
import { getAiProvider } from '../providers/ai/factory';
import { ScoredQuery } from './types';
import { createLogger } from '../logger';

const logger = createLogger('generate');

/**
 * Generate a full article from a query and outline
 */
export async function generateArticle(
    query: ScoredQuery,
    outline: ArticleOutline
): Promise<GeneratedArticle> {
    logger.info('Generating article', {
        query: query.query,
        title: outline.title
    });

    try {
        const aiProvider = getAiProvider();
        const article = await aiProvider.generateArticle(
            query.query,
            outline,
            query.topicCategory
        );

        // Add table of contents
        const toc = generateTableOfContents(article.headings);
        article.content = insertTableOfContents(article.content, toc);

        logger.info('Article generated', {
            title: article.title,
            wordCount: article.wordCount,
            headings: article.headings.length,
        });

        return article;
    } catch (error) {
        logger.error('Failed to generate article', {
            query: query.query,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}

/**
 * Generate a table of contents from headings
 */
export function generateTableOfContents(headings: string[]): string {
    if (headings.length < 3) {
        return '';
    }

    const tocItems = headings
        .filter(h => !h.toLowerCase().includes('disclaimer') &&
            !h.toLowerCase().includes('sources'))
        .map(heading => {
            const slug = heading
                .toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '-');
            return `<li><a href="#${slug}">${heading}</a></li>`;
        })
        .join('\n');

    return `
<div class="table-of-contents">
<h2>Table of Contents</h2>
<ul>
${tocItems}
</ul>
</div>
`;
}

/**
 * Insert table of contents after the opening paragraphs
 */
function insertTableOfContents(content: string, toc: string): string {
    if (!toc) return content;

    // Insert after first two paragraphs (the direct answer)
    const paragraphs = content.split('</p>');
    if (paragraphs.length >= 2) {
        paragraphs.splice(2, 0, toc);
        return paragraphs.join('</p>');
    }

    // Fallback: insert at beginning
    return toc + content;
}

/**
 * Add anchor IDs to headings for TOC links
 */
export function addHeadingAnchors(content: string): string {
    return content.replace(
        /<h([2-6])>([^<]+)<\/h[2-6]>/gi,
        (match, level, text) => {
            const slug = text
                .toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, '-');
            return `<h${level} id="${slug}">${text}</h${level}>`;
        }
    );
}

export default { generateArticle, generateTableOfContents, addHeadingAnchors };
