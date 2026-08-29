import type { AiInferenceProfileKey } from './aiInferenceProfiles.js';
import type { AiModelProfile, AiProvider } from './aiModelTypes.js';

export type AiProviderProfileMap = Readonly<Record<AiModelProfile, string | null>>;

export type AiModelProfileCostTier = 'premium' | 'standard' | 'economy' | 'specialized' | 'unavailable';

export type AiModelProfileCostApproval = Readonly<{
    modelKey: string;
    approvedAt: string;
    reason: string;
}>;

export type AiModelProfileCostPolicy = Readonly<{
    costTier: AiModelProfileCostTier;
    referenceModelKey: string | null;
    maxInputUsdPerMillionTokens: number | null;
    maxCachedInputUsdPerMillionTokens: number | null;
    maxOutputUsdPerMillionTokens: number | null;
    maxCacheWrite5mUsdPerMillionTokens: number | null;
    maxCacheWrite1hUsdPerMillionTokens: number | null;
    maxLongContextInputUsdPerMillionTokens: number | null;
    maxLongContextCachedInputUsdPerMillionTokens: number | null;
    maxLongContextOutputUsdPerMillionTokens: number | null;
    maxInputPriceMultiplier: number | null;
    maxCachedInputPriceMultiplier: number | null;
    maxOutputPriceMultiplier: number | null;
    maxCacheWritePriceMultiplier: number | null;
    approvedHigherCostModels: readonly AiModelProfileCostApproval[];
    notes: string;
}>;

export type AiModelProfileDefault = Readonly<{
    modelKey: string | null;
    inferenceProfileKey: AiInferenceProfileKey | null;
}>;

export type AiProviderModelProfileDefaultMap = Readonly<Record<AiModelProfile, AiModelProfileDefault>>;

export type AiProviderModelProfileCostPolicyMap = Readonly<Record<AiModelProfile, AiModelProfileCostPolicy>>;

const createCostPolicy = (policy: AiModelProfileCostPolicy): AiModelProfileCostPolicy => policy;

export const AI_PROVIDER_MODEL_PROFILE_DEFAULTS: Readonly<Record<AiProvider, AiProviderModelProfileDefaultMap>> = {
    openai: {
        reasoning: {
            modelKey: 'openai:gpt-5.6-terra',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'openai:gpt-5.6-terra',
            inferenceProfileKey: 'reasoning_medium'
        },
        fast: {
            modelKey: 'openai:gpt-5.6-luna',
            inferenceProfileKey: 'reasoning_low'
        },
        cheap: {
            modelKey: 'openai:gpt-5.6-luna',
            inferenceProfileKey: 'reasoning_none'
        },
        title: {
            modelKey: 'openai:gpt-5.6-luna',
            inferenceProfileKey: 'reasoning_none'
        },
        webSearch: {
            modelKey: 'openai:gpt-5.6-terra',
            inferenceProfileKey: 'reasoning_medium'
        },
        deepResearch: {
            modelKey: 'openai:gpt-5.6-sol',
            inferenceProfileKey: 'reasoning_high'
        }
    },
    anthropic: {
        reasoning: {
            modelKey: 'anthropic:claude-opus-5',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'anthropic:claude-sonnet-5',
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
            modelKey: 'anthropic:claude-sonnet-5',
            inferenceProfileKey: 'reasoning_medium'
        },
        deepResearch: {
            modelKey: null,
            inferenceProfileKey: null
        }
    }
} as const;

export const AI_PROVIDER_MODEL_PROFILE_COST_POLICIES: Readonly<Record<AiProvider, AiProviderModelProfileCostPolicyMap>> = {
    openai: {
        reasoning: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'openai:gpt-5.6-terra',
            maxInputUsdPerMillionTokens: 2,
            maxCachedInputUsdPerMillionTokens: 0.2,
            maxOutputUsdPerMillionTokens: 12,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 4,
            maxLongContextCachedInputUsdPerMillionTokens: 0.4,
            maxLongContextOutputUsdPerMillionTokens: 18,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Reasoning defaults use Terra for strong reasoning at the standard GPT-5.6 price tier; Sol promotions require explicit approval.'
        }),
        balanced: createCostPolicy({
            costTier: 'standard',
            referenceModelKey: 'openai:gpt-5.6-terra',
            maxInputUsdPerMillionTokens: 2,
            maxCachedInputUsdPerMillionTokens: 0.2,
            maxOutputUsdPerMillionTokens: 12,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 4,
            maxLongContextCachedInputUsdPerMillionTokens: 0.4,
            maxLongContextOutputUsdPerMillionTokens: 18,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Balanced defaults serve broad app traffic and must not be silently promoted above the current standard tier.'
        }),
        fast: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'openai:gpt-5.6-luna',
            maxInputUsdPerMillionTokens: 0.2,
            maxCachedInputUsdPerMillionTokens: 0.02,
            maxOutputUsdPerMillionTokens: 1.2,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 0.4,
            maxLongContextCachedInputUsdPerMillionTokens: 0.04,
            maxLongContextOutputUsdPerMillionTokens: 1.8,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Fast defaults use Luna for low-latency, high-volume workloads and must remain at the Luna price tier.'
        }),
        cheap: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'openai:gpt-5.6-luna',
            maxInputUsdPerMillionTokens: 0.2,
            maxCachedInputUsdPerMillionTokens: 0.02,
            maxOutputUsdPerMillionTokens: 1.2,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 0.4,
            maxLongContextCachedInputUsdPerMillionTokens: 0.04,
            maxLongContextOutputUsdPerMillionTokens: 1.8,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Cheap defaults use Luna and must remain at its high-volume background-task price tier.'
        }),
        title: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'openai:gpt-5.6-luna',
            maxInputUsdPerMillionTokens: 0.2,
            maxCachedInputUsdPerMillionTokens: 0.02,
            maxOutputUsdPerMillionTokens: 1.2,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 0.4,
            maxLongContextCachedInputUsdPerMillionTokens: 0.04,
            maxLongContextOutputUsdPerMillionTokens: 1.8,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Title-generation defaults are latency/cost sensitive and should stay at the Luna price tier.'
        }),
        webSearch: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'openai:gpt-5.6-terra',
            maxInputUsdPerMillionTokens: 2,
            maxCachedInputUsdPerMillionTokens: 0.2,
            maxOutputUsdPerMillionTokens: 12,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 4,
            maxLongContextCachedInputUsdPerMillionTokens: 0.4,
            maxLongContextOutputUsdPerMillionTokens: 18,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Web-search defaults use search-capable Terra for broad production traffic; Sol promotions require approval.'
        }),
        deepResearch: createCostPolicy({
            costTier: 'specialized',
            referenceModelKey: 'openai:gpt-5.6-sol',
            maxInputUsdPerMillionTokens: 4,
            maxCachedInputUsdPerMillionTokens: 0.4,
            maxOutputUsdPerMillionTokens: 20,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 8,
            maxLongContextCachedInputUsdPerMillionTokens: 0.8,
            maxLongContextOutputUsdPerMillionTokens: 30,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Deep research intentionally uses quality-first Sol at promotional rates available at least through November 21, 2026; other profiles should remain on Terra or Luna unless separately approved.'
        })
    },
    anthropic: {
        reasoning: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'anthropic:claude-opus-4-8',
            maxInputUsdPerMillionTokens: 5,
            maxCachedInputUsdPerMillionTokens: 0.5,
            maxOutputUsdPerMillionTokens: 25,
            maxCacheWrite5mUsdPerMillionTokens: 6.25,
            maxCacheWrite1hUsdPerMillionTokens: 10,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: 1.01,
            approvedHigherCostModels: [],
            notes: 'Reasoning defaults may move within the Opus cost tier; Fable/Mythos-tier promotions require explicit approval.'
        }),
        balanced: createCostPolicy({
            costTier: 'standard',
            referenceModelKey: 'anthropic:claude-sonnet-4-6',
            maxInputUsdPerMillionTokens: 3,
            maxCachedInputUsdPerMillionTokens: 0.3,
            maxOutputUsdPerMillionTokens: 15,
            maxCacheWrite5mUsdPerMillionTokens: 3.75,
            maxCacheWrite1hUsdPerMillionTokens: 6,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: 1.01,
            approvedHigherCostModels: [],
            notes: 'Balanced defaults must stay at the Sonnet cost tier unless a more expensive promotion is approved.'
        }),
        fast: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'anthropic:claude-haiku-4-5',
            maxInputUsdPerMillionTokens: 1,
            maxCachedInputUsdPerMillionTokens: 0.1,
            maxOutputUsdPerMillionTokens: 5,
            maxCacheWrite5mUsdPerMillionTokens: 1.25,
            maxCacheWrite1hUsdPerMillionTokens: 2,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: 1.01,
            approvedHigherCostModels: [],
            notes: 'Fast defaults must stay at the Haiku cost tier for high-volume app traffic.'
        }),
        cheap: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'anthropic:claude-haiku-4-5',
            maxInputUsdPerMillionTokens: 1,
            maxCachedInputUsdPerMillionTokens: 0.1,
            maxOutputUsdPerMillionTokens: 5,
            maxCacheWrite5mUsdPerMillionTokens: 1.25,
            maxCacheWrite1hUsdPerMillionTokens: 2,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: 1.01,
            approvedHigherCostModels: [],
            notes: 'Cheap defaults must stay at the Haiku cost tier.'
        }),
        title: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'anthropic:claude-haiku-4-5',
            maxInputUsdPerMillionTokens: 1,
            maxCachedInputUsdPerMillionTokens: 0.1,
            maxOutputUsdPerMillionTokens: 5,
            maxCacheWrite5mUsdPerMillionTokens: 1.25,
            maxCacheWrite1hUsdPerMillionTokens: 2,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: 1.01,
            approvedHigherCostModels: [],
            notes: 'Title-generation defaults must stay at the Haiku cost tier.'
        }),
        webSearch: createCostPolicy({
            costTier: 'standard',
            referenceModelKey: 'anthropic:claude-sonnet-4-6',
            maxInputUsdPerMillionTokens: 3,
            maxCachedInputUsdPerMillionTokens: 0.3,
            maxOutputUsdPerMillionTokens: 15,
            maxCacheWrite5mUsdPerMillionTokens: 3.75,
            maxCacheWrite1hUsdPerMillionTokens: 6,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: 1.01,
            approvedHigherCostModels: [],
            notes: 'Anthropic web-search defaults stay at the Sonnet tier while no dedicated lower-cost search model is configured.'
        }),
        deepResearch: createCostPolicy({
            costTier: 'unavailable',
            referenceModelKey: null,
            maxInputUsdPerMillionTokens: null,
            maxCachedInputUsdPerMillionTokens: null,
            maxOutputUsdPerMillionTokens: null,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: null,
            maxCachedInputPriceMultiplier: null,
            maxOutputPriceMultiplier: null,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Anthropic does not currently have a configured dedicated deep-research default.'
        })
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
