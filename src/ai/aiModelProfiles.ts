import type { AiModelProfile, AiProvider } from './aiModelTypes.js';

export type AiProviderProfileMap = Readonly<Record<AiModelProfile, string | null>>;

export const AI_PROVIDER_MODEL_PROFILES: Readonly<Record<AiProvider, AiProviderProfileMap>> = {
    openai: {
        reasoning: 'openai:gpt-5.4',
        balanced: 'openai:gpt-5.4-mini',
        fast: 'openai:gpt-5.4-mini',
        cheap: 'openai:gpt-5.4-nano',
        title: 'openai:gpt-5.4-nano',
        webSearch: 'openai:gpt-5.4',
        deepResearch: 'openai:o3-deep-research'
    },
    anthropic: {
        reasoning: 'anthropic:claude-opus-4-7',
        balanced: 'anthropic:claude-sonnet-4-6',
        fast: 'anthropic:claude-haiku-4-5',
        cheap: 'anthropic:claude-haiku-4-5',
        title: 'anthropic:claude-haiku-4-5',
        webSearch: 'anthropic:claude-sonnet-4-6',
        deepResearch: null
    }
} as const;

export const AI_GLOBAL_MODEL_PROFILES: Readonly<Record<AiModelProfile, string | null>> = {
    reasoning: AI_PROVIDER_MODEL_PROFILES.openai.reasoning,
    balanced: AI_PROVIDER_MODEL_PROFILES.openai.balanced,
    fast: AI_PROVIDER_MODEL_PROFILES.openai.fast,
    cheap: AI_PROVIDER_MODEL_PROFILES.openai.cheap,
    title: AI_PROVIDER_MODEL_PROFILES.openai.title,
    webSearch: AI_PROVIDER_MODEL_PROFILES.openai.webSearch,
    deepResearch: AI_PROVIDER_MODEL_PROFILES.openai.deepResearch
} as const;
