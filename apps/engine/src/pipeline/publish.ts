/**
 * Publish Step
 * 
 * Publish generated articles to WordPress.
 */

import slugify from 'slugify';
import { v4 as uuid } from 'uuid';
import config from '../config';
import { query, withTransaction } from '../db';
import { createLogger } from '../logger';
import { wordPressPublisher } from '../providers/publishing';
import { GeneratedArticle } from '../providers/ai';
import { ScoredQuery, PostRecord } from './types';
import { calculateContentHash } from './qualityGate';
import { addInternalLinks } from './internalLinks';
import { addHeadingAnchors } from './generate';

const logger = createLogger('publish');

/**
 * Generate a slug from a query
 */
export function generateSlug(query: string): string {
    return slugify(query, {
        lower: true,
        strict: true,
        trim: true,
    }).slice(0, 200);
}

/**
 * Check if we've hit the daily publish limit
 */
export async function checkPublishLimit(): Promise<boolean> {
    const result = await query<{ count: string }>(
        `SELECT COUNT(*) as count 
     FROM posts 
     WHERE first_published_at >= NOW() - INTERVAL '24 hours'`
    );

    const count = parseInt(result.rows[0].count, 10);
    const limitReached = count >= config.publishing.dailyLimit;

    if (limitReached) {
        logger.warn('Daily publish limit reached', {
            count,
            limit: config.publishing.dailyLimit
        });
    }

    return limitReached;
}

/**
 * Publish an article to WordPress and save to database
 */
export async function publishArticle(
    scoredQuery: ScoredQuery,
    article: GeneratedArticle,
    category?: string
): Promise<PostRecord> {
    const slug = generateSlug(scoredQuery.query);

    logger.info('Publishing article', {
        title: article.title,
        slug,
        mode: config.publishing.mode
    });

    // Add heading anchors for TOC links
    let content = addHeadingAnchors(article.content);

    // Add internal links
    if (category) {
        content = await addInternalLinks(content, category, slug);
    }

    // Calculate content hash
    const contentHash = calculateContentHash(content);

    try {
        // Publish to WordPress
        const publishedPost = await wordPressPublisher.createPost({
            title: article.title,
            content,
            slug,
            excerpt: article.metaDescription,
            category,
            status: config.publishing.mode,
            metaDescription: article.metaDescription,
        });

        // Save to database
        const postRecord = await withTransaction(async (client) => {
            const postId = uuid();
            const now = new Date();

            await client.query(
                `INSERT INTO posts (
          id, query_id, wp_post_id, slug, title, content_hash,
          version, status, first_published_at, last_published_at,
          word_count, heading_count, has_faq, has_sources,
          quality_score, category, meta_description
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17
        )`,
                [
                    postId,
                    scoredQuery.id || null,
                    publishedPost.id,
                    slug,
                    article.title,
                    contentHash,
                    1,
                    config.publishing.mode === 'publish' ? 'published' : 'draft',
                    now,
                    now,
                    article.wordCount,
                    article.headings.length,
                    article.hasFaq,
                    article.hasSources,
                    0.8, // Default quality score
                    category || null,
                    article.metaDescription,
                ]
            );

            // Update query status
            if (scoredQuery.id) {
                await client.query(
                    `UPDATE queries SET status = 'published' WHERE id = $1`,
                    [scoredQuery.id]
                );
            }

            // Log publish action
            await client.query(
                `INSERT INTO publish_log (id, post_id, action, wp_response)
         VALUES ($1, $2, $3, $4)`,
                [uuid(), postId, 'create', JSON.stringify(publishedPost)]
            );

            return {
                id: postId,
                queryId: scoredQuery.id,
                wpPostId: publishedPost.id,
                slug,
                title: article.title,
                contentHash,
                version: 1,
                status: config.publishing.mode === 'publish' ? 'published' : 'draft',
                firstPublishedAt: now,
                lastPublishedAt: now,
                wordCount: article.wordCount,
                headingCount: article.headings.length,
                hasFaq: article.hasFaq,
                hasSources: article.hasSources,
                category,
                metaDescription: article.metaDescription,
            } as PostRecord;
        });

        logger.info('Article published successfully', {
            postId: postRecord.id,
            wpPostId: publishedPost.id,
            url: publishedPost.url,
        });

        return postRecord;
    } catch (error) {
        logger.error('Failed to publish article', {
            title: article.title,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw error;
    }
}

export default {
    generateSlug,
    checkPublishLimit,
    publishArticle,
};
