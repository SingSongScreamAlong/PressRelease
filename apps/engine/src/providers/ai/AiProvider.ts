/**
 * AI Provider Interface
 * 
 * Defines the contract for AI content generation providers.
 * Implementations can use OpenAI, Anthropic, or other providers.
 */

export interface GenerationOptions {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
}

export interface ArticleOutline {
    title: string;
    metaDescription: string;
    sections: Array<{
        heading: string;
        level: 'h2' | 'h3';
        points: string[];
    }>;
    faqQuestions: string[];
}

export interface GeneratedArticle {
    title: string;
    metaDescription: string;
    content: string;
    wordCount: number;
    headings: string[];
    hasFaq: boolean;
    hasSources: boolean;
    hasDisclaimer: boolean;
}

export interface AiProvider {
    /**
     * Provider name for logging
     */
    readonly name: string;

    /**
     * Generate text completion
     */
    complete(prompt: string, options?: GenerationOptions): Promise<string>;

    /**
     * Generate an article outline from a query
     */
    generateOutline(query: string, context?: string): Promise<ArticleOutline>;

    /**
     * Generate a full article from an outline
     */
    generateArticle(
        query: string,
        outline: ArticleOutline,
        category?: string
    ): Promise<GeneratedArticle>;

    /**
     * Check if the provider is properly configured
     */
    isConfigured(): boolean;
}
