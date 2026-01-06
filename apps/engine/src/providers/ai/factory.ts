/**
 * AI Provider Factory
 * 
 * Returns the configured AI provider based on environment settings.
 */

import config from '../../config';
import { createLogger } from '../../logger';
import { AiProvider } from './AiProvider';
import { openAiProvider } from './OpenAiProvider';
import { geminiProvider } from './GeminiProvider';

const logger = createLogger('ai-provider');

let currentProvider: AiProvider | null = null;

/**
 * Get the configured AI provider
 */
export function getAiProvider(): AiProvider {
    if (currentProvider) {
        return currentProvider;
    }

    const providerName = config.ai.provider;

    switch (providerName) {
        case 'gemini':
            if (!geminiProvider.isConfigured()) {
                throw new Error('Gemini provider not configured - missing GEMINI_API_KEY');
            }
            currentProvider = geminiProvider;
            logger.info('Using Gemini AI provider', { model: config.gemini.model });
            break;

        case 'openai':
        default:
            if (!openAiProvider.isConfigured()) {
                throw new Error('OpenAI provider not configured - missing OPENAI_API_KEY');
            }
            currentProvider = openAiProvider;
            logger.info('Using OpenAI provider', { model: config.openai.model });
            break;
    }

    return currentProvider;
}

/**
 * Reset the provider (for testing)
 */
export function resetProvider(): void {
    currentProvider = null;
}

export default { getAiProvider, resetProvider };
