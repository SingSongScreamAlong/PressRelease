/**
 * Strategy Engine - Trend Monitoring
 * 
 * Monitors Google Trends and news to identify high-potential topics
 * before they become saturated.
 */

import { createLogger } from '../logger';

const logger = createLogger('trends-monitor');

// Google Trends API types
export interface TrendingTopic {
    keyword: string;
    value: number;           // Search interest (0-100)
    growthRate: number;      // Percentage growth
    region: string;
    category?: string;
    relatedQueries: string[];
    fetchedAt: Date;
}

interface TrendResult {
    success: boolean;
    topics: TrendingTopic[];
    error?: string;
}

/**
 * Fetch trending topics from Google Trends
 * Uses google-trends-api package for data retrieval
 */
export async function fetchTrendingTopics(options: {
    region?: string;
    category?: string;
    timeRange?: 'now 1-H' | 'now 4-H' | 'now 1-d' | 'now 7-d';
} = {}): Promise<TrendResult> {
    const { region = 'US', category, timeRange = 'now 1-d' } = options;

    logger.info('Fetching trending topics', { region, category, timeRange });

    try {
        // Dynamic import of google-trends-api
        // @ts-ignore
        const googleTrends = await import('google-trends-api');

        // Get daily trends with timeout
        const dailyTrends = await Promise.race([
            googleTrends.dailyTrends({ geo: region }),
            new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error('Google Trends API timeout')), 15000)
            )
        ]);

        const parsed = JSON.parse(dailyTrends);
        const trendingSearches = parsed?.default?.trendingSearchesDays?.[0]?.trendingSearches || [];

        const topics: TrendingTopic[] = trendingSearches.slice(0, 20).map((trend: any) => ({
            keyword: trend.title?.query || trend.query || '',
            value: trend.formattedTraffic ? parseInt(trend.formattedTraffic.replace(/[^0-9]/g, '')) : 0,
            growthRate: 0, // Calculate from historical data if needed
            region,
            category: trend.articles?.[0]?.category || undefined,
            relatedQueries: trend.relatedQueries?.map((q: any) => q.query) || [],
            fetchedAt: new Date(),
        }));

        logger.info('Trending topics fetched', { count: topics.length });

        return {
            success: true,
            topics,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to fetch trending topics', { error: errorMsg });

        return {
            success: false,
            topics: [],
            error: errorMsg,
        };
    }
}

/**
 * Get rising queries for a specific keyword
 */
export async function getRisingQueries(keyword: string, region: string = 'US'): Promise<string[]> {
    logger.info('Fetching rising queries', { keyword, region });

    try {
        // @ts-ignore
        const googleTrends = await import('google-trends-api');

        const relatedQueries = await googleTrends.relatedQueries({
            keyword,
            geo: region,
        });

        const parsed = JSON.parse(relatedQueries);
        const rising = parsed?.default?.rankedList?.[1]?.rankedKeyword || [];

        return rising.slice(0, 10).map((q: any) => q.query);
    } catch (error) {
        logger.warn('Failed to fetch rising queries', { keyword, error });
        return [];
    }
}

/**
 * Check if a topic is YMYL (Your Money Your Life)
 * These topics require extra care and may have lower ad revenue potential
 */
export function isYMYLTopic(keyword: string): boolean {
    const ymylPatterns = [
        /\b(health|medical|doctor|disease|symptom|treatment)\b/i,
        /\b(finance|investment|stock|crypto|tax|loan|mortgage)\b/i,
        /\b(legal|lawyer|lawsuit|court|attorney)\b/i,
        /\b(insurance|medicare|medicaid)\b/i,
        /\b(drug|medication|prescription)\b/i,
    ];

    return ymylPatterns.some(pattern => pattern.test(keyword));
}

/**
 * Score a topic for content potential
 * Higher score = better opportunity
 */
export function scoreTopic(topic: TrendingTopic): number {
    let score = 50; // Base score

    // Higher search volume = higher score
    if (topic.value > 100000) score += 30;
    else if (topic.value > 10000) score += 20;
    else if (topic.value > 1000) score += 10;

    // Avoid YMYL topics (lower score but still usable)
    if (isYMYLTopic(topic.keyword)) {
        score -= 20;
    }

    // Boost if has related queries (more content angles)
    score += Math.min(topic.relatedQueries.length * 2, 15);

    return Math.max(0, Math.min(100, score));
}

export default {
    fetchTrendingTopics,
    getRisingQueries,
    isYMYLTopic,
    scoreTopic,
};
