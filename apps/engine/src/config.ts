import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Application configuration loaded from environment variables
 */
export const config = {
    // Node environment
    nodeEnv: process.env.NODE_ENV || 'development',
    isDev: process.env.NODE_ENV !== 'production',

    // Database
    database: {
        url: process.env.DATABASE_URL || 'postgres://engine:engine@localhost:5432/readallaboutit',
    },

    // AI Provider selection: 'openai' or 'gemini'
    ai: {
        provider: (process.env.AI_PROVIDER || 'openai') as 'openai' | 'gemini',
    },

    // OpenAI
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },

    // Gemini
    gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    },

    // WordPress
    wordpress: {
        url: process.env.WP_URL || 'http://localhost:8080',
        username: process.env.WP_USERNAME || 'admin',
        appPassword: process.env.WP_APP_PASSWORD || '',
    },

    // Publishing
    publishing: {
        mode: (process.env.PUBLISH_MODE || 'draft') as 'draft' | 'publish',
        dailyLimit: parseInt(process.env.DAILY_PUBLISH_LIMIT || '10', 10),
    },

    // Safety
    safety: {
        safeTopicsOnly: process.env.SAFE_TOPICS_ONLY === 'true',
        ymylThreshold: parseFloat(process.env.YMYL_THRESHOLD || '0.7'),
    },

    // Scheduler
    scheduler: {
        cronSchedule: process.env.CRON_SCHEDULE || '0 */4 * * *',
        enabled: process.env.SCHEDULER_ENABLED !== 'false',
    },

    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },

    // Refresh settings
    refresh: {
        intervalDays: parseInt(process.env.REFRESH_INTERVAL_DAYS || '30', 10),
        batchSize: parseInt(process.env.REFRESH_BATCH_SIZE || '5', 10),
    },

    // Quality gate thresholds
    quality: {
        minHeadings: parseInt(process.env.MIN_HEADINGS || '3', 10),
        minWordCount: parseInt(process.env.MIN_WORD_COUNT || '500', 10),
        maxSimilarity: parseFloat(process.env.MAX_SIMILARITY || '0.8'),
    },
} as const;

/**
 * Validate required configuration
 */
export function validateConfig(): void {
    // Check AI provider configuration
    const aiProvider = config.ai.provider;
    if (aiProvider === 'openai' && !config.openai.apiKey) {
        throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    }
    if (aiProvider === 'gemini' && !config.gemini.apiKey) {
        throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
    }

    // Check WordPress configuration
    if (!config.wordpress.username || !config.wordpress.appPassword) {
        throw new Error('WP_USERNAME and WP_APP_PASSWORD are required');
    }
}

export default config;
