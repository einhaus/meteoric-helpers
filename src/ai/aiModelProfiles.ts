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
        creativeWritingPremium: {
            modelKey: 'openai:gpt-6.2-sol',
            inferenceProfileKey: 'reasoning_medium'
        },
        reasoning: {
            modelKey: 'openai:gpt-6-sol',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'openai:gpt-6-sol',
            inferenceProfileKey: 'reasoning_medium'
        },
        fast: {
            modelKey: 'openai:gpt-6-luna',
            inferenceProfileKey: 'reasoning_low'
        },
        cheap: {
            modelKey: 'openai:gpt-6-luna',
            inferenceProfileKey: 'reasoning_none'
        },
        title: {
            modelKey: 'openai:gpt-6-luna',
            inferenceProfileKey: 'reasoning_none'
        },
        webSearch: {
            modelKey: 'openai:gpt-6-sol',
            inferenceProfileKey: 'reasoning_medium'
        },
        deepResearch: {
            modelKey: 'openai:gpt-5.6-sol',
            inferenceProfileKey: null
        }
    },
    anthropic: {
        creativeWritingPremium: {
            modelKey: 'anthropic:claude-opus-5-5',
            inferenceProfileKey: 'reasoning_medium'
        },
        reasoning: {
            modelKey: 'anthropic:claude-opus-5-5',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'anthropic:claude-sonnet-5-5',
            inferenceProfileKey: 'reasoning_medium'
        },
        fast: {
            modelKey: 'anthropic:claude-haiku-5-5',
            inferenceProfileKey: 'reasoning_low'
        },
        cheap: {
            modelKey: 'anthropic:claude-haiku-5-5',
            inferenceProfileKey: 'reasoning_none'
        },
        title: {
            modelKey: 'anthropic:claude-haiku-5-5',
            inferenceProfileKey: 'reasoning_none'
        },
        webSearch: {
            modelKey: 'anthropic:claude-sonnet-5-5',
            inferenceProfileKey: 'reasoning_medium'
        },
        deepResearch: {
            modelKey: null,
            inferenceProfileKey: null
        }
    },
    google: {
        creativeWritingPremium: {
            modelKey: 'google:gemini-4-neon',
            inferenceProfileKey: 'reasoning_medium'
        },
        reasoning: {
            modelKey: 'google:gemini-4-carbon',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'google:gemini-4-hydrogen',
            inferenceProfileKey: 'reasoning_medium'
        },
        fast: {
            modelKey: 'google:gemini-3.8-flash',
            inferenceProfileKey: 'reasoning_low'
        },
        cheap: {
            modelKey: 'google:gemini-3.5-flash-lite',
            inferenceProfileKey: null
        },
        title: {
            modelKey: 'google:gemini-3.5-flash-lite',
            inferenceProfileKey: null
        },
        webSearch: {
            modelKey: 'google:gemini-4-hydrogen',
            inferenceProfileKey: 'reasoning_medium'
        },
        deepResearch: {
            modelKey: null,
            inferenceProfileKey: null
        }
    },
    xai: {
        creativeWritingPremium: {
            modelKey: 'xai:grok-4.7',
            inferenceProfileKey: 'reasoning_medium'
        },
        reasoning: {
            modelKey: 'xai:grok-4.7',
            inferenceProfileKey: 'reasoning_high'
        },
        balanced: {
            modelKey: 'xai:grok-4.7',
            inferenceProfileKey: 'reasoning_medium'
        },
        fast: {
            modelKey: 'xai:grok-4-1-fast-reasoning',
            inferenceProfileKey: null
        },
        cheap: {
            modelKey: 'xai:grok-4-1-fast-non-reasoning',
            inferenceProfileKey: null
        },
        title: {
            modelKey: 'xai:grok-4-1-fast-non-reasoning',
            inferenceProfileKey: null
        },
        webSearch: {
            modelKey: 'xai:grok-4.7',
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
        creativeWritingPremium: createCostPolicy({
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
            notes: 'Premium creative writing is selected independently of general reasoning. Review writing quality, request compatibility, and cost before promoting a replacement.'
        }),
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
            notes: 'Reasoning defaults use GPT-6 Sol within the existing GPT-5.6 Terra price ceiling; higher-cost promotions require explicit approval.'
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
            notes: 'Fast defaults use GPT-6 Luna for low-latency, high-volume workloads and must remain within the GPT-5.6 Luna reference tier.'
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
            notes: 'Cheap defaults use GPT-6 Luna and must remain within the GPT-5.6 Luna high-volume background-task reference tier.'
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
            notes: 'Title-generation defaults use GPT-6 Luna and must remain within the GPT-5.6 Luna latency/cost reference tier.'
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
            notes: 'Web-search defaults use search-capable GPT-6 Sol within the existing GPT-5.6 Terra price ceiling.'
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
            notes: 'OpenAI retired both dedicated deep-research aliases on July 23, 2026 and recommends GPT-5.6 Sol. Restore a dedicated default only when an active purpose-built replacement is documented and passes this cost policy.'
        })
    },
    anthropic: {
        creativeWritingPremium: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'anthropic:claude-opus-5-5',
            maxInputUsdPerMillionTokens: 4,
            maxCachedInputUsdPerMillionTokens: 0.2,
            maxOutputUsdPerMillionTokens: 20,
            maxCacheWrite5mUsdPerMillionTokens: 5,
            maxCacheWrite1hUsdPerMillionTokens: 8,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: 1.01,
            approvedHigherCostModels: [],
            notes: 'Premium creative writing is selected independently of general reasoning. Review writing quality, request compatibility, and cost before promoting a replacement.'
        }),
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
    },
    google: {
        creativeWritingPremium: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'google:gemini-4-neon',
            maxInputUsdPerMillionTokens: 3,
            maxCachedInputUsdPerMillionTokens: 0.15,
            maxOutputUsdPerMillionTokens: 15,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Google creative-writing premium defaults stay at the Gemini 4 Neon tier.'
        }),
        reasoning: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'google:gemini-4-carbon',
            maxInputUsdPerMillionTokens: 4,
            maxCachedInputUsdPerMillionTokens: 0.2,
            maxOutputUsdPerMillionTokens: 20,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Google reasoning defaults stay at the Gemini 4 Carbon tier.'
        }),
        balanced: createCostPolicy({
            costTier: 'standard',
            referenceModelKey: 'google:gemini-4-hydrogen',
            maxInputUsdPerMillionTokens: 1.5,
            maxCachedInputUsdPerMillionTokens: 0.075,
            maxOutputUsdPerMillionTokens: 7.5,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Google balanced defaults stay at the Gemini 4 Hydrogen tier unless a higher-cost model is explicitly approved.'
        }),
        fast: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'google:gemini-3.8-flash',
            maxInputUsdPerMillionTokens: 0.75,
            maxCachedInputUsdPerMillionTokens: 0.075,
            maxOutputUsdPerMillionTokens: 3.75,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Google fast defaults stay at the Gemini Flash tier.'
        }),
        cheap: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'google:gemini-3.5-flash-lite',
            maxInputUsdPerMillionTokens: 0.3,
            maxCachedInputUsdPerMillionTokens: 0.03,
            maxOutputUsdPerMillionTokens: 2.5,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Google cheap defaults stay at the Gemini Flash-Lite tier.'
        }),
        title: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'google:gemini-3.5-flash-lite',
            maxInputUsdPerMillionTokens: 0.3,
            maxCachedInputUsdPerMillionTokens: 0.03,
            maxOutputUsdPerMillionTokens: 2.5,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Google title-generation defaults stay at the Gemini Flash-Lite tier.'
        }),
        webSearch: createCostPolicy({
            costTier: 'standard',
            referenceModelKey: 'google:gemini-4-hydrogen',
            maxInputUsdPerMillionTokens: 1.5,
            maxCachedInputUsdPerMillionTokens: 0.075,
            maxOutputUsdPerMillionTokens: 7.5,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'Google web-search defaults stay at the Gemini 4 Hydrogen tier with Search grounding.'
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
            notes: 'Google does not currently have a configured dedicated deep-research default in the standard chat catalog.'
        })
    },
    xai: {
        creativeWritingPremium: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'xai:grok-4.7',
            maxInputUsdPerMillionTokens: 2,
            maxCachedInputUsdPerMillionTokens: 0.5,
            maxOutputUsdPerMillionTokens: 6,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 4,
            maxLongContextCachedInputUsdPerMillionTokens: 1,
            maxLongContextOutputUsdPerMillionTokens: 12,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'xAI creative-writing premium defaults stay at the Grok 4.7 tier.'
        }),
        reasoning: createCostPolicy({
            costTier: 'premium',
            referenceModelKey: 'xai:grok-4.7',
            maxInputUsdPerMillionTokens: 2,
            maxCachedInputUsdPerMillionTokens: 0.5,
            maxOutputUsdPerMillionTokens: 6,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 4,
            maxLongContextCachedInputUsdPerMillionTokens: 1,
            maxLongContextOutputUsdPerMillionTokens: 12,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'xAI reasoning defaults stay at the Grok 4.7 tier.'
        }),
        balanced: createCostPolicy({
            costTier: 'standard',
            referenceModelKey: 'xai:grok-4.7',
            maxInputUsdPerMillionTokens: 2,
            maxCachedInputUsdPerMillionTokens: 0.5,
            maxOutputUsdPerMillionTokens: 6,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 4,
            maxLongContextCachedInputUsdPerMillionTokens: 1,
            maxLongContextOutputUsdPerMillionTokens: 12,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'xAI balanced defaults stay at the Grok 4.7 tier unless a higher-cost model is explicitly approved.'
        }),
        fast: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'xai:grok-4-1-fast-reasoning',
            maxInputUsdPerMillionTokens: 0.2,
            maxCachedInputUsdPerMillionTokens: 0.05,
            maxOutputUsdPerMillionTokens: 0.5,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'xAI fast defaults stay at the Grok Fast economy tier.'
        }),
        cheap: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'xai:grok-4-1-fast-non-reasoning',
            maxInputUsdPerMillionTokens: 0.2,
            maxCachedInputUsdPerMillionTokens: 0.05,
            maxOutputUsdPerMillionTokens: 0.5,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'xAI cheap defaults stay at the Grok Fast economy tier.'
        }),
        title: createCostPolicy({
            costTier: 'economy',
            referenceModelKey: 'xai:grok-4-1-fast-non-reasoning',
            maxInputUsdPerMillionTokens: 0.2,
            maxCachedInputUsdPerMillionTokens: 0.05,
            maxOutputUsdPerMillionTokens: 0.5,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: null,
            maxLongContextCachedInputUsdPerMillionTokens: null,
            maxLongContextOutputUsdPerMillionTokens: null,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'xAI title-generation defaults stay at the Grok Fast economy tier.'
        }),
        webSearch: createCostPolicy({
            costTier: 'standard',
            referenceModelKey: 'xai:grok-4.7',
            maxInputUsdPerMillionTokens: 2,
            maxCachedInputUsdPerMillionTokens: 0.5,
            maxOutputUsdPerMillionTokens: 6,
            maxCacheWrite5mUsdPerMillionTokens: null,
            maxCacheWrite1hUsdPerMillionTokens: null,
            maxLongContextInputUsdPerMillionTokens: 4,
            maxLongContextCachedInputUsdPerMillionTokens: 1,
            maxLongContextOutputUsdPerMillionTokens: 12,
            maxInputPriceMultiplier: 1.01,
            maxCachedInputPriceMultiplier: 1.01,
            maxOutputPriceMultiplier: 1.01,
            maxCacheWritePriceMultiplier: null,
            approvedHigherCostModels: [],
            notes: 'xAI web-search defaults stay at the Grok 4.7 tier with native web and X search.'
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
            notes: 'xAI does not currently have a configured dedicated deep-research default.'
        })
    }
} as const;

export const AI_PROVIDER_MODEL_PROFILES: Readonly<Record<AiProvider, AiProviderProfileMap>> = {
    openai: {
        creativeWritingPremium: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.creativeWritingPremium.modelKey,
        reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.reasoning.modelKey,
        balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.balanced.modelKey,
        fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.fast.modelKey,
        cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.cheap.modelKey,
        title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.title.modelKey,
        webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.webSearch.modelKey,
        deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.deepResearch.modelKey
    },
    anthropic: {
        creativeWritingPremium: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.creativeWritingPremium.modelKey,
        reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.reasoning.modelKey,
        balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.balanced.modelKey,
        fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.fast.modelKey,
        cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.cheap.modelKey,
        title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.title.modelKey,
        webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.webSearch.modelKey,
        deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.deepResearch.modelKey
    },
    google: {
        creativeWritingPremium: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.creativeWritingPremium.modelKey,
        reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.reasoning.modelKey,
        balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.balanced.modelKey,
        fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.fast.modelKey,
        cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.cheap.modelKey,
        title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.title.modelKey,
        webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.webSearch.modelKey,
        deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.google.deepResearch.modelKey
    },
    xai: {
        creativeWritingPremium: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.creativeWritingPremium.modelKey,
        reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.reasoning.modelKey,
        balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.balanced.modelKey,
        fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.fast.modelKey,
        cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.cheap.modelKey,
        title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.title.modelKey,
        webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.webSearch.modelKey,
        deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.xai.deepResearch.modelKey
    }
} as const;

export const AI_GLOBAL_MODEL_PROFILE_DEFAULTS: Readonly<Record<AiModelProfile, AiModelProfileDefault>> = {
    creativeWritingPremium: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.anthropic.creativeWritingPremium,
    reasoning: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.reasoning,
    balanced: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.balanced,
    fast: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.fast,
    cheap: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.cheap,
    title: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.title,
    webSearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.webSearch,
    deepResearch: AI_PROVIDER_MODEL_PROFILE_DEFAULTS.openai.deepResearch
} as const;

export const AI_GLOBAL_MODEL_PROFILES: Readonly<Record<AiModelProfile, string | null>> = {
    creativeWritingPremium: AI_PROVIDER_MODEL_PROFILES.anthropic.creativeWritingPremium,
    reasoning: AI_PROVIDER_MODEL_PROFILES.openai.reasoning,
    balanced: AI_PROVIDER_MODEL_PROFILES.openai.balanced,
    fast: AI_PROVIDER_MODEL_PROFILES.openai.fast,
    cheap: AI_PROVIDER_MODEL_PROFILES.openai.cheap,
    title: AI_PROVIDER_MODEL_PROFILES.openai.title,
    webSearch: AI_PROVIDER_MODEL_PROFILES.openai.webSearch,
    deepResearch: AI_PROVIDER_MODEL_PROFILES.openai.deepResearch
} as const;
