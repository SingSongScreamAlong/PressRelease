/**
 * Outline Generation
 * 
 * Generate article outlines from scored queries.
 */

import { ArticleOutline } from '../providers/ai';
import { getAiProvider } from '../providers/ai/factory';
import { ScoredQuery } from './types';
import { createLogger } from '../logger';

const logger = createLogger('outline');

/**
 * Generate an article outline for a query
 */
export async function generateOutline(
    query: ScoredQuery
): Promise<ArticleOutline> {
    logger.info('Generating outline', { query: query.query });

    try {
        const aiProvider = getAiProvider();
        const outline = await aiProvider.generateOutline(
            query.query,
            query.topicCategory
        );

        logger.info('Outline generated', {
            title: outline.title,
            sections: outline.sections.length,
            faqCount: outline.faqQuestions.length,
        });

        return outline;
    } catch (error) {
        logger.error('Failed to generate outline', {
            query: query.query,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}

/**
 * Validate an outline has required structure
 */
export function validateOutline(outline: ArticleOutline): boolean {
    if (!outline.title || outline.title.length < 10) {
        logger.warn('Outline missing valid title');
        return false;
    }

    if (!outline.metaDescription || outline.metaDescription.length < 50) {
        logger.warn('Outline missing valid meta description');
        return false;
    }

    if (!outline.sections || outline.sections.length < 3) {
        logger.warn('Outline has insufficient sections', {
            count: outline.sections?.length || 0,
        });
        return false;
    }

    if (!outline.faqQuestions || outline.faqQuestions.length < 2) {
        logger.warn('Outline has insufficient FAQ questions', {
            count: outline.faqQuestions?.length || 0,
        });
        return false;
    }

    return true;
}

export default { generateOutline, validateOutline };
