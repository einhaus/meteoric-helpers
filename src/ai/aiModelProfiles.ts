import type { AiInferenceProfileKey } from './aiInferenceProfiles.js';
import type { AiModelProfile, AiProvider } from './aiModelTypes.js';

export type AiProviderProfileMap = Readonly<Record<AiModelProfile, string | null>>;

export type AiModelProfileDefault = Readonly<{
    modelKey: string | null;
    inferenceProfileKey: AiInferenceProfileKey | null;
}>;

export type AiProviderModelProfileDefaultMap = Readonly<Record<AiModelProfile, AiModelProfileDefault>>;

export const AI_PROVIDER_MODEL_PROFILE_DEFAULTS: Readonly<Record<AiProvider, AiProviderModelProfileDefaultMap>> = {
    openai: {
        reasoning: {
            modelKey: 'openai:gpt-5.5',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'openai:gpt-5.5',
            inferenceProfileKey: 'reasoning_medium'
        },
        fast: {
            modelKey: 'openai:gpt-5.4-mini',
            inferenceProfileKey: 'reasoning_low'
        },
        cheap: {
            modelKey: 'openai:gpt-5.4-nano',
            inferenceProfileKey: 'reasoning_none'
        },
        title: {
            modelKey: 'openai:gpt-5.4-nano',
            inferenceProfileKey: 'reasoning_none'
        },
        webSearch: {
            modelKey: 'openai:gpt-5.5',
            inferenceProfileKey: 'reasoning_medium'
        },
        deepResearch: {
            modelKey: 'openai:o3-deep-research',
            inferenceProfileKey: 'reasoning_high'
        }
    },
    anthropic: {
        reasoning: {
            modelKey: 'anthropic:claude-opus-4-7',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'anthropic:claude-sonnet-4-6',
            inferenceProfileKey: 'reasoning_medium'
        },
        fast: {
            modelKey: 'anthropic:claude-haiku-4-5',
            inferenceProfileKey: 'reasoning_low'
        },
        cheap: {
            modelKey: 'anthropic:claude-haiku-4-5',
            inferenceProfileKey: 'reasoning_none'
        },
        title: {
            modelKey: 'anthropic:claude-haiku-4-5',
            inferenceProfileKey: 'reasoning_none'
        },
        webSearch: {
            modelKey: 'anthropic:claude-sonnet-4-6',
            inferenceProfileKey: 'reasoning_medium'
        },
        deepResearch: {
            modelKey: null,
            inferenceProfileKey: null
        }
    }
} as const;

export const AI_PROVIDER_MODEL_PROFILES: Readonly<Record<AiProvider, AiProviderProfileMap>> = {
    openai: {
        reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.reasoning.modelKey,
        balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.balanced.modelKey,
        fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.fast.modelKey,
        cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.cheap.modelKey,
        title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.title.modelKey,
        webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.webSearch.modelKey,
        deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.deepResearch.modelKey
    },
    anthropic: {
        reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.reasoning.modelKey,
        balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.balanced.modelKey,
        fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.fast.modelKey,
        cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.cheap.modelKey,
        title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.title.modelKey,
        webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.webSearch.modelKey,
        deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.deepResearch.modelKey
    }
} as const;

export const AI_GLOBAL_MODEL_PROFILE_DEFAULTS: Readonly<Record<AiModelProfile, AiModelProfileDefault>> = {
    reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.reasoning,
    balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.balanced,
    fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.fast,
    cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.cheap,
    title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.title,
    webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.webSearch,
    deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.deepResearch
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
