import axios from 'axios';
import config from '../../config';
import { createLogger } from '../../logger';
import {
    AiProvider,
    GenerationOptions,
    ArticleOutline,
    GeneratedArticle,
} from './AiProvider';
import {
    SYSTEM_PROMPT,
    OUTLINE_PROMPT,
    ARTICLE_PROMPT,
    GLOBAL_DISCLAIMER,
    SOURCES_SECTION,
} from './prompts';

const logger = createLogger('gemini-provider');

/**
 * Google Gemini AI Provider implementation
 */
export class GeminiProvider implements AiProvider {
    readonly name = 'Gemini';
    private apiKey: string;
    private model: string;
    private baseUrl = 'https://generativelanguage.googleapis.com/v1';

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    }

    isConfigured(): boolean {
        return !!this.apiKey;
    }

    async complete(prompt: string, options?: GenerationOptions): Promise<string> {
        logger.debug('Generating completion with Gemini', { promptLength: prompt.length });

        try {
            const systemPrompt = options?.systemPrompt || SYSTEM_PROMPT;
            const fullPrompt = `${systemPrompt}\n\n${prompt}`;

            const response = await axios.post(
                `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
                {
                    contents: [
                        {
                            parts: [{ text: fullPrompt }]
                        }
                    ],
                    generationConfig: {
                        temperature: options?.temperature ?? 0.7,
                        maxOutputTokens: options?.maxTokens ?? 8192,
                    }
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    timeout: 60000,
                }
            );

            const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            logger.debug('Gemini completion generated', {
                responseLength: content.length
            });

            return content;
        } catch (error) {
            const errorMessage = axios.isAxiosError(error)
                ? error.response?.data?.error?.message || error.message
                : error instanceof Error ? error.message : 'Unknown error';

            logger.error('Gemini API error', { error: errorMessage });
            throw new Error(`Gemini API error: ${errorMessage}`);
        }
    }

    async generateOutline(query: string, context?: string): Promise<ArticleOutline> {
        logger.info('Generating outline with Gemini', { query });

        const prompt = OUTLINE_PROMPT(query, context);
        const response = await this.complete(prompt, { temperature: 0.7 });

        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const outline = JSON.parse(jsonMatch[0]) as ArticleOutline;

            // Validate outline structure
            if (!outline.title || !outline.sections || outline.sections.length === 0) {
                throw new Error('Invalid outline structure');
            }

            logger.info('Outline generated', {
                title: outline.title,
                sections: outline.sections.length
            });

            return outline;
        } catch (error) {
            logger.error('Failed to parse outline', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to generate valid outline');
        }
    }

    async generateArticle(
        query: string,
        outline: ArticleOutline,
        category?: string
    ): Promise<GeneratedArticle> {
        logger.info('Generating article with Gemini', { query, title: outline.title });

        const prompt = ARTICLE_PROMPT(query, outline, category);
        const content = await this.complete(prompt, {
            temperature: 0.7,
            maxTokens: 8192
        });

        // Add global disclaimer and sources section
        const fullContent = `
${content}
${GLOBAL_DISCLAIMER}
${SOURCES_SECTION([])}
`;

        // Extract headings from content
        const headingMatches = fullContent.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/gi) || [];
        const headings = headingMatches.map(h => h.replace(/<[^>]+>/g, ''));

        // Calculate word count
        const textContent = fullContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const wordCount = textContent.split(' ').filter(w => w.length > 0).length;

        const article: GeneratedArticle = {
            title: outline.title,
            metaDescription: outline.metaDescription,
            content: fullContent,
            wordCount,
            headings,
            hasFaq: fullContent.toLowerCase().includes('frequently asked questions') ||
                fullContent.toLowerCase().includes('faq'),
            hasSources: fullContent.toLowerCase().includes('sources'),
            hasDisclaimer: fullContent.toLowerCase().includes('disclaimer'),
        };

        logger.info('Article generated', {
            title: article.title,
            wordCount: article.wordCount,
            headings: article.headings.length,
        });

        return article;
    }
}

// Export singleton instance
export const geminiProvider = new GeminiProvider();
