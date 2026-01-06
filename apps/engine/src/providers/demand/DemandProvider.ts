/**
 * Demand Provider Interface
 * 
 * Defines the contract for search demand discovery providers.
 * Implementations can use Google Autocomplete, Google Trends, etc.
 */

export interface Suggestion {
    query: string;
    source: string;
    relevance?: number;
}

export interface DemandData {
    keyword: string;
    suggestions: Suggestion[];
    retrievedAt: Date;
}

export interface DemandProvider {
    /**
     * Provider name for logging
     */
    readonly name: string;

    /**
     * Discover related search queries for a keyword
     */
    discover(keyword: string): Promise<Suggestion[]>;

    /**
     * Check if the provider is properly configured
     */
    isConfigured(): boolean;

    /**
     * Get rate limit info (requests per minute)
     */
    getRateLimit(): number;
}
