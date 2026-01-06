/**
 * Refresh Loop
 * 
 * Periodically update older posts to keep content fresh.
 */

import { v4 as uuid } from 'uuid';
import config from '../config';
import { query, withTransaction } from '../db';
import { createLogger } from '../logger';
import { wordPressPublisher } from '../providers/publishing';
import { GeneratedArticle } from '../providers/ai';
import { getAiProvider } from '../providers/ai/factory';
import { PostRecord } from './types';
import { runQualityGate, calculateContentHash } from './qualityGate';
import { addHeadingAnchors } from './generate';
import { addInternalLinks } from './internalLinks';

const logger = createLogger('refresh');

/**
 * Find posts due for refresh
 */
export async function findPostsToRefresh(limit: number): Promise<PostRecord[]> {
    const result = await query<PostRecord>(
        `SELECT * FROM posts 
     WHERE status = 'published'
       AND (
         next_refresh_at IS NULL 
         OR next_refresh_at <= NOW()
       )
       AND last_refreshed_at IS NULL 
         OR last_refreshed_at < NOW() - INTERVAL '${config.refresh.intervalDays} days'
     ORDER BY first_published_at ASC
     LIMIT $1`,
        [limit]
    );

    logger.info('Posts found for refresh', { count: result.rows.length });
    return result.rows;
}

/**
 * Regenerate article content for refresh
 */
async function regenerateArticle(
    post: PostRecord
): Promise<GeneratedArticle> {
    logger.info('Regenerating article', { title: post.title, slug: post.slug });

    // Generate new outline
    const aiProvider = getAiProvider();
    const outline = await aiProvider.generateOutline(post.title);

    // Generate new article
    const article = await aiProvider.generateArticle(
        post.title,
        outline,
        post.category
    );

    return article;
}

/**
 * Refresh a single post
 */
export async function refreshPost(post: PostRecord): Promise<boolean> {
    logger.info('Refreshing post', {
        id: post.id,
        title: post.title,
        version: post.version
    });

    try {
        // Regenerate content
        const article = await regenerateArticle(post);

        // Run quality gate
        const qualityResult = runQualityGate(article);
        if (!qualityResult.passed) {
            logger.warn('Refreshed content failed quality gate', {
                postId: post.id,
                issues: qualityResult.issues,
            });
            return false;
        }

        // Add heading anchors
        let content = addHeadingAnchors(article.content);

        // Add internal links
        if (post.category) {
            content = await addInternalLinks(content, post.category, post.slug);
        }

        const contentHash = calculateContentHash(content);

        // Update WordPress
        if (post.wpPostId) {
            await wordPressPublisher.updatePost(post.wpPostId, {
                content,
                excerpt: article.metaDescription,
            });
        }

        // Update database
        await withTransaction(async (client) => {
            const now = new Date();
            const nextRefresh = new Date(
                now.getTime() + config.refresh.intervalDays * 24 * 60 * 60 * 1000
            );

            await client.query(
                `UPDATE posts SET
          content_hash = $1,
          version = version + 1,
          last_refreshed_at = $2,
          next_refresh_at = $3,
          word_count = $4,
          heading_count = $5,
          meta_description = $6,
          updated_at = $2
        WHERE id = $7`,
                [
                    contentHash,
                    now,
                    nextRefresh,
                    article.wordCount,
                    article.headings.length,
                    article.metaDescription,
                    post.id,
                ]
            );

            // Log refresh action
            await client.query(
                `INSERT INTO publish_log (id, post_id, action, wp_response)
         VALUES ($1, $2, $3, $4)`,
                [uuid(), post.id, 'refresh', JSON.stringify({ version: post.version + 1 })]
            );
        });

        logger.info('Post refreshed successfully', {
            postId: post.id,
            newVersion: post.version + 1,
        });

        return true;
    } catch (error) {
        logger.error('Failed to refresh post', {
            postId: post.id,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return false;
    }
}

/**
 * Run the refresh loop for all due posts
 */
export async function runRefreshLoop(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
}> {
    logger.info('Starting refresh loop');

    const posts = await findPostsToRefresh(config.refresh.batchSize);

    let succeeded = 0;
    let failed = 0;

    for (const post of posts) {
        const success = await refreshPost(post);
        if (success) {
            succeeded++;
        } else {
            failed++;
        }

        // Small delay between refreshes
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    logger.info('Refresh loop completed', {
        processed: posts.length,
        succeeded,
        failed,
    });

    return {
        processed: posts.length,
        succeeded,
        failed,
    };
}

export default {
    findPostsToRefresh,
    refreshPost,
    runRefreshLoop,
};
