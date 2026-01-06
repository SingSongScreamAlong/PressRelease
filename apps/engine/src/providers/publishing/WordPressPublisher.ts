import axios, { AxiosInstance } from 'axios';
import config from '../../config';
import { createLogger } from '../../logger';
import { Publisher, PostData, PublishedPost, UpdatePostData } from './Publisher';

const logger = createLogger('wordpress-publisher');

/**
 * WordPress Publisher Implementation
 * 
 * Publishes content to WordPress via the REST API.
 * Requires Application Passwords for authentication.
 */
export class WordPressPublisher implements Publisher {
    readonly name = 'WordPress';

    private client: AxiosInstance;
    private categoryCache: Map<string, number> = new Map();
    private tagCache: Map<string, number> = new Map();

    constructor() {
        const baseURL = config.wordpress.url.replace(/\/$/, '');

        this.client = axios.create({
            baseURL: `${baseURL}/wp-json/wp/v2`,
            timeout: 30000,
            auth: {
                username: config.wordpress.username,
                password: config.wordpress.appPassword,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    isConfigured(): boolean {
        return !!(config.wordpress.username && config.wordpress.appPassword);
    }

    async testConnection(): Promise<boolean> {
        try {
            const response = await this.client.get('/users/me');
            logger.info('WordPress connection verified', {
                user: response.data.name
            });
            return true;
        } catch (error) {
            logger.error('WordPress connection failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }

    async createPost(data: PostData): Promise<PublishedPost> {
        logger.info('Creating post', { title: data.title, slug: data.slug });

        try {
            // Ensure category exists
            let categoryIds: number[] = [];
            if (data.category) {
                const categoryId = await this.ensureCategory(data.category);
                categoryIds = [categoryId];
            }

            // Ensure tags exist
            let tagIds: number[] = [];
            if (data.tags && data.tags.length > 0) {
                tagIds = await this.ensureTags(data.tags);
            }

            // Create the post
            const response = await this.client.post('/posts', {
                title: data.title,
                content: data.content,
                slug: data.slug,
                excerpt: data.excerpt || data.metaDescription,
                status: data.status,
                categories: categoryIds,
                tags: tagIds,
            });

            const post = this.mapPost(response.data);
            logger.info('Post created', {
                id: post.id,
                slug: post.slug,
                url: post.url
            });

            return post;
        } catch (error) {
            logger.error('Failed to create post', {
                title: data.title,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async updatePost(postId: number, data: UpdatePostData): Promise<PublishedPost> {
        logger.info('Updating post', { postId });

        try {
            const response = await this.client.put(`/posts/${postId}`, {
                ...(data.title && { title: data.title }),
                ...(data.content && { content: data.content }),
                ...(data.excerpt && { excerpt: data.excerpt }),
                ...(data.status && { status: data.status }),
            });

            const post = this.mapPost(response.data);
            logger.info('Post updated', { id: post.id, slug: post.slug });

            return post;
        } catch (error) {
            logger.error('Failed to update post', {
                postId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async getPost(postId: number): Promise<PublishedPost | null> {
        try {
            const response = await this.client.get(`/posts/${postId}`);
            return this.mapPost(response.data);
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }

    async deletePost(postId: number): Promise<boolean> {
        try {
            await this.client.delete(`/posts/${postId}`, {
                params: { force: true },
            });
            logger.info('Post deleted', { postId });
            return true;
        } catch (error) {
            logger.error('Failed to delete post', { postId });
            return false;
        }
    }

    async ensureCategory(name: string): Promise<number> {
        // Check cache first
        if (this.categoryCache.has(name)) {
            return this.categoryCache.get(name)!;
        }

        try {
            // Try to find existing category
            const searchResponse = await this.client.get('/categories', {
                params: { search: name, per_page: 10 },
            });

            const existing = searchResponse.data.find(
                (cat: { name: string }) => cat.name.toLowerCase() === name.toLowerCase()
            );

            if (existing) {
                this.categoryCache.set(name, existing.id);
                return existing.id;
            }

            // Create new category
            const createResponse = await this.client.post('/categories', {
                name,
                slug: name.toLowerCase().replace(/\s+/g, '-'),
            });

            const categoryId = createResponse.data.id;
            this.categoryCache.set(name, categoryId);
            logger.info('Category created', { name, id: categoryId });

            return categoryId;
        } catch (error) {
            logger.error('Failed to ensure category', {
                name,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async ensureTags(names: string[]): Promise<number[]> {
        const tagIds: number[] = [];

        for (const name of names) {
            // Check cache
            if (this.tagCache.has(name)) {
                tagIds.push(this.tagCache.get(name)!);
                continue;
            }

            try {
                // Try to find existing tag
                const searchResponse = await this.client.get('/tags', {
                    params: { search: name, per_page: 10 },
                });

                const existing = searchResponse.data.find(
                    (tag: { name: string }) => tag.name.toLowerCase() === name.toLowerCase()
                );

                if (existing) {
                    this.tagCache.set(name, existing.id);
                    tagIds.push(existing.id);
                    continue;
                }

                // Create new tag
                const createResponse = await this.client.post('/tags', {
                    name,
                    slug: name.toLowerCase().replace(/\s+/g, '-'),
                });

                const tagId = createResponse.data.id;
                this.tagCache.set(name, tagId);
                tagIds.push(tagId);
                logger.debug('Tag created', { name, id: tagId });
            } catch (error) {
                logger.warn('Failed to ensure tag', { name });
            }
        }

        return tagIds;
    }

    private mapPost(data: {
        id: number;
        title: { rendered: string };
        slug: string;
        link: string;
        status: string;
        date?: string;
    }): PublishedPost {
        return {
            id: data.id,
            title: data.title.rendered,
            slug: data.slug,
            url: data.link,
            status: data.status,
            publishedAt: data.date ? new Date(data.date) : undefined,
        };
    }
}

// Export singleton instance
export const wordPressPublisher = new WordPressPublisher();
