/**
 * Publisher Interface
 * 
 * Defines the contract for content publishing providers.
 * Implementations can use WordPress, Ghost, custom CMSs, etc.
 */

export interface PostData {
    title: string;
    content: string;
    slug: string;
    excerpt?: string;
    category?: string;
    tags?: string[];
    status: 'draft' | 'publish';
    metaDescription?: string;
}

export interface PublishedPost {
    id: number;
    title: string;
    slug: string;
    url: string;
    status: string;
    publishedAt?: Date;
}

export interface UpdatePostData {
    title?: string;
    content?: string;
    excerpt?: string;
    status?: 'draft' | 'publish';
}

export interface Publisher {
    /**
     * Publisher name for logging
     */
    readonly name: string;

    /**
     * Create a new post
     */
    createPost(data: PostData): Promise<PublishedPost>;

    /**
     * Update an existing post
     */
    updatePost(postId: number, data: UpdatePostData): Promise<PublishedPost>;

    /**
     * Get a post by ID
     */
    getPost(postId: number): Promise<PublishedPost | null>;

    /**
     * Delete a post
     */
    deletePost(postId: number): Promise<boolean>;

    /**
     * Create or get a category by name
     */
    ensureCategory(name: string): Promise<number>;

    /**
     * Create or get tags by name
     */
    ensureTags(names: string[]): Promise<number[]>;

    /**
     * Check if the publisher is properly configured
     */
    isConfigured(): boolean;

    /**
     * Test connection to the publishing platform
     */
    testConnection(): Promise<boolean>;
}
