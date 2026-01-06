import OpenAI from 'openai';
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

const logger = createLogger('openai-provider');

/**
 * OpenAI-based AI Provider implementation
 */
export class OpenAiProvider implements AiProvider {
    readonly name = 'OpenAI';
    private client: OpenAI;
    private model: string;

    constructor() {
        this.client = new OpenAI({
            apiKey: config.openai.apiKey,
        });
        this.model = config.openai.model;
    }

    isConfigured(): boolean {
        return !!config.openai.apiKey;
    }

    async complete(prompt: string, options?: GenerationOptions): Promise<string> {
        logger.debug('Generating completion', { promptLength: prompt.length });

        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    { role: 'system', content: options?.systemPrompt || SYSTEM_PROMPT },
                    { role: 'user', content: prompt },
                ],
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens ?? 4096,
            });

            const content = response.choices[0]?.message?.content || '';
            logger.debug('Completion generated', {
                tokens: response.usage?.total_tokens
            });

            return content;
        } catch (error) {
            logger.error('OpenAI API error', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error;
        }
    }

    async generateOutline(query: string, context?: string): Promise<ArticleOutline> {
        logger.info('Generating outline', { query });

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
        logger.info('Generating article', { query, title: outline.title });

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
export const openAiProvider = new OpenAiProvider();
