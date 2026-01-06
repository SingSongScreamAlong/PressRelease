import axios from 'axios';
import { createLogger } from '../../logger';
import { DemandProvider, Suggestion } from './DemandProvider';

const logger = createLogger('google-autocomplete');

/**
 * Google Autocomplete Provider
 * 
 * Fetches search suggestions from Google Autocomplete API.
 * Rate limiting is applied to avoid blocking.
 */
export class GoogleAutocompleteProvider implements DemandProvider {
    readonly name = 'GoogleAutocomplete';

    private lastRequestTime = 0;
    private readonly minRequestInterval = 1000; // 1 second between requests
    private readonly maxRetries = 3;
    private readonly retryDelay = 2000;

    isConfigured(): boolean {
        return true; // No API key needed
    }

    getRateLimit(): number {
        return 60; // ~60 requests per minute
    }

    async discover(keyword: string): Promise<Suggestion[]> {
        logger.info('Discovering suggestions', { keyword });

        // Rate limiting
        await this.waitForRateLimit();

        const suggestions: Suggestion[] = [];
        const prefixes = ['', 'how to ', 'what is ', 'can I ', 'how much ', 'how long ', 'why ', 'when '];

        for (const prefix of prefixes) {
            try {
                const query = prefix ? `${prefix}${keyword}` : keyword;
                const results = await this.fetchSuggestionsWithRetry(query);

                for (const result of results) {
                    if (!suggestions.find(s => s.query === result)) {
                        suggestions.push({
                            query: result,
                            source: this.name,
                            relevance: prefix ? 0.8 : 1.0,
                        });
                    }
                }

                // Small delay between prefix queries
                await this.sleep(200);
            } catch (error) {
                logger.warn('Failed to fetch suggestions for prefix', { prefix, keyword });
            }
        }

        logger.info('Suggestions discovered', {
            keyword,
            count: suggestions.length
        });

        return suggestions;
    }

    private async fetchSuggestionsWithRetry(query: string): Promise<string[]> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                return await this.fetchSuggestions(query);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                logger.warn('Retry attempt', { attempt, query, error: lastError.message });

                if (attempt < this.maxRetries) {
                    await this.sleep(this.retryDelay * attempt);
                }
            }
        }

        throw lastError || new Error('Max retries exceeded');
    }

    private async fetchSuggestions(query: string): Promise<string[]> {
        this.lastRequestTime = Date.now();

        const url = 'https://suggestqueries.google.com/complete/search';
        const params = {
            client: 'firefox',
            q: query,
            hl: 'en',
        };

        const response = await axios.get(url, {
            params,
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
        });

        // Response format: [query, [suggestions]]
        const data = response.data;
        if (Array.isArray(data) && Array.isArray(data[1])) {
            return data[1].filter((s: unknown): s is string => typeof s === 'string');
        }

        return [];
    }

    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            await this.sleep(waitTime);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance
export const googleAutocompleteProvider = new GoogleAutocompleteProvider();
