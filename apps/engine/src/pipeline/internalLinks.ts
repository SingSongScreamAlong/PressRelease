/**
 * Internal Linking
 * 
 * Add related post links to articles for SEO and navigation.
 */

import { query } from '../db';
import { createLogger } from '../logger';

const logger = createLogger('internal-links');

interface RelatedPost {
    id: string;
    title: string;
    slug: string;
    category: string;
}

/**
 * Find related posts in the same category
 */
export async function findRelatedPosts(
    category: string,
    excludeSlug: string,
    limit: number = 5
): Promise<RelatedPost[]> {
    try {
        const result = await query<RelatedPost>(
            `SELECT id, title, slug, category 
       FROM posts 
       WHERE category = $1 
         AND slug != $2 
         AND status = 'published'
       ORDER BY first_published_at DESC
       LIMIT $3`,
            [category, excludeSlug, limit]
        );

        return result.rows;
    } catch (error) {
        logger.error('Failed to find related posts', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
    }
}

/**
 * Generate related posts HTML section
 */
export function generateRelatedPostsHtml(
    posts: RelatedPost[],
    baseUrl: string = ''
): string {
    if (posts.length === 0) {
        return '';
    }

    const links = posts
        .map(post => {
            const url = `${baseUrl}/${post.slug}/`;
            return `<li><a href="${url}">${post.title}</a></li>`;
        })
        .join('\n');

    return `
<div class="related-posts">
<h2>Related Articles</h2>
<ul>
${links}
</ul>
</div>
`;
}

/**
 * Insert related posts section into article content
 */
export function insertRelatedPosts(
    content: string,
    relatedHtml: string
): string {
    if (!relatedHtml) return content;

    // Insert before disclaimer or sources section
    const insertPoints = [
        '<div class="disclaimer">',
        '<div class="sources">',
        '</body>',
    ];

    for (const point of insertPoints) {
        const index = content.indexOf(point);
        if (index !== -1) {
            return content.slice(0, index) + relatedHtml + content.slice(index);
        }
    }

    // Fallback: append at end
    return content + relatedHtml;
}

/**
 * Add internal links to an article
 */
export async function addInternalLinks(
    content: string,
    category: string,
    currentSlug: string,
    baseUrl: string = ''
): Promise<string> {
    logger.info('Adding internal links', { category, currentSlug });

    try {
        const relatedPosts = await findRelatedPosts(category, currentSlug, 5);

        if (relatedPosts.length === 0) {
            logger.debug('No related posts found');
            return content;
        }

        const relatedHtml = generateRelatedPostsHtml(relatedPosts, baseUrl);
        const updatedContent = insertRelatedPosts(content, relatedHtml);

        logger.info('Internal links added', {
            relatedCount: relatedPosts.length
        });

        return updatedContent;
    } catch (error) {
        logger.error('Failed to add internal links', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return content;
    }
}

export default {
    findRelatedPosts,
    generateRelatedPostsHtml,
    insertRelatedPosts,
    addInternalLinks,
};
