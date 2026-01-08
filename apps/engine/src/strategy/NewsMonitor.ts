/**
 * Strategy Engine - News Monitoring
 * 
 * Monitors news headlines to identify timely content opportunities.
 * Uses RSS feeds and news APIs to stay current.
 */

import axios from 'axios';
import { createLogger } from '../logger';

const logger = createLogger('news-monitor');

export interface NewsHeadline {
    title: string;
    source: string;
    url: string;
    publishedAt: Date;
    category?: string;
    description?: string;
}

export interface NewsResult {
    success: boolean;
    headlines: NewsHeadline[];
    error?: string;
}

// Common RSS feed sources for general news
const RSS_FEEDS = [
    { name: 'Google News', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en' },
    { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'Reuters', url: 'https://www.reutersagency.com/feed/' },
];

/**
 * Fetch headlines from RSS feeds
 */
export async function fetchNewsHeadlines(options: {
    maxHeadlines?: number;
    category?: string;
} = {}): Promise<NewsResult> {
    const { maxHeadlines = 20 } = options;

    logger.info('Fetching news headlines', { maxHeadlines });

    try {
        const headlines: NewsHeadline[] = [];

        // For now, use a simple fetch approach
        // In production, use a proper RSS parser like 'rss-parser'
        for (const feed of RSS_FEEDS.slice(0, 2)) {
            try {
                const response = await axios.get(feed.url, {
                    headers: {
                        'User-Agent': 'ReadAllAboutIt/1.0 (Content Research Bot)',
                    },
                    timeout: 10000,
                });

                if (response.status === 200) {
                    const text = response.data;
                    const items = parseRSSItems(text, feed.name);
                    headlines.push(...items);
                }
            } catch (feedError) {
                logger.debug('Feed fetch failed', { feed: feed.name, error: feedError });
            }
        }

        // Dedupe and sort by date
        const uniqueHeadlines = dedupeHeadlines(headlines)
            .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, maxHeadlines);

        logger.info('Headlines fetched', { count: uniqueHeadlines.length });

        return {
            success: true,
            headlines: uniqueHeadlines,
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to fetch headlines', { error: errorMsg });

        return {
            success: false,
            headlines: [],
            error: errorMsg,
        };
    }
}

/**
 * Simple RSS XML parser (basic implementation)
 * In production, use 'rss-parser' package
 */
function parseRSSItems(xml: string, source: string): NewsHeadline[] {
    const items: NewsHeadline[] = [];

    // Basic regex parsing for RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
        const itemContent = match[1];

        const titleMatch = itemContent.match(/<title><!\[CDATA\[(.*?)\]\]>|<title>(.*?)<\/title>/);
        const linkMatch = itemContent.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
        const descMatch = itemContent.match(/<description><!\[CDATA\[(.*?)\]\]>|<description>(.*?)<\/description>/);

        const title = titleMatch?.[1] || titleMatch?.[2] || '';
        const url = linkMatch?.[1] || '';
        const pubDate = pubDateMatch?.[1] || '';
        const description = descMatch?.[1] || descMatch?.[2] || '';

        if (title && title.length > 10) {
            items.push({
                title: cleanHTML(title),
                source,
                url,
                publishedAt: pubDate ? new Date(pubDate) : new Date(),
                description: cleanHTML(description).slice(0, 200),
            });
        }
    }

    return items;
}

/**
 * Clean HTML tags and entities from text
 */
function cleanHTML(text: string): string {
    return text
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .trim();
}

/**
 * Remove duplicate headlines based on title similarity
 */
function dedupeHeadlines(headlines: NewsHeadline[]): NewsHeadline[] {
    const seen = new Set<string>();
    return headlines.filter(h => {
        const key = h.title.toLowerCase().slice(0, 50);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Extract potential keywords from a headline
 */
export function extractKeywords(headline: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'it', 'its',
        'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
        'how', 'why', 'when', 'where', 'says', 'said', 'new', 'after',
    ]);

    const words = headline
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));

    // Extract 2-3 word phrases
    const phrases: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
        const twoWord = `${words[i]} ${words[i + 1]}`;
        if (twoWord.length > 6) {
            phrases.push(twoWord);
        }
    }

    return [...phrases, ...words].slice(0, 5);
}

export default {
    fetchNewsHeadlines,
    extractKeywords,
};
