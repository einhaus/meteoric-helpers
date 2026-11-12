import type { AiModelCapabilities, AiModelCatalogEntry } from './aiModelTypes.js';

const GEMINI_VERIFIED_AT = '2026-11-12';

const createGeminiModel = (params: {
    modelId: string;
    displayName: string;
    family: string;
    description: string;
    reasoningEffortLevels?: AiModelCapabilities['reasoningEffortLevels'];
    replacementModelId?: string;
    inputPrice: number;
    cachedInputPrice: number;
    outputPrice: number;
    pricingNotes?: string;
    temperaturePolicy?: NonNullable<AiModelCatalogEntry['parameterPolicies']>['temperature'];
}): AiModelCatalogEntry<'google'> => ({
    modelKey: `google:${params.modelId}`,
    provider: 'google',
    modelId: params.modelId,
    snapshotModelId: null,
    aliases: [`models/${params.modelId}`],
    displayName: params.displayName,
    family: params.family,
    description: params.description,
    status: params.replacementModelId ? 'deprecated' : 'active',
    recommendedReplacementModelKey: params.replacementModelId ? `google:${params.replacementModelId}` : null,
    inputModalities: ['text', 'image', 'audio', 'video'],
    outputModalities: ['text'],
    capabilities: {
        supportsTextInput: true,
        supportsTextOutput: true,
        supportsImageInput: true,
        supportsAudioInput: true,
        supportsAudioOutput: false,
        supportsVision: true,
        supportsStreaming: true,
        supportsToolCalling: true,
        supportsStructuredOutputs: true,
        supportsPromptCaching: true,
        supportsWebSearch: true,
        supportsFileSearch: true,
        supportsComputerUse: null,
        supportsMcp: null,
        supportsReasoningEffort: params.reasoningEffortLevels ? true : null,
        reasoningEffortLevels: params.reasoningEffortLevels ?? [],
        supportsExtendedThinking: null,
        supportsAdaptiveThinking: null
    },
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    knowledgeCutoff: null,
    pricing: {
        inputUsdPerMillionTokens: params.inputPrice,
        cachedInputUsdPerMillionTokens: params.cachedInputPrice,
        outputUsdPerMillionTokens: params.outputPrice,
        cacheWrite5mUsdPerMillionTokens: null,
        cacheWrite1hUsdPerMillionTokens: null,
        longContextThresholdInputTokens: null,
        longContextInputUsdPerMillionTokens: null,
        longContextCachedInputUsdPerMillionTokens: null,
        longContextOutputUsdPerMillionTokens: null,
        notes: params.pricingNotes ?? null
    },
    sources: [
        { label: 'Google Gemini models', url: 'https://aistudio.google.com/docs/models', verifiedAt: GEMINI_VERIFIED_AT },
        {
            label: 'Google Gemini pricing',
            url: `https://aistudio.google.com/docs/pricing#${params.modelId}`,
            verifiedAt: GEMINI_VERIFIED_AT
        },
        params.replacementModelId
            ? { label: 'Google Gemini deprecations', url: 'https://aistudio.google.com/docs/deprecations', verifiedAt: GEMINI_VERIFIED_AT }
            : { label: 'Google Gemini release notes', url: 'https://aistudio.google.com/docs/changelog', verifiedAt: GEMINI_VERIFIED_AT }
    ],
    tags: ['multimodal', 'video-understanding'],
    parameterPolicies: { temperature: params.temperaturePolicy ?? 'unsupported' }
});

export const GEMINI_MODEL_CATALOG: readonly AiModelCatalogEntry<'google'>[] = [
    createGeminiModel({
        modelId: 'gemini-4-hydrogen',
        displayName: 'Gemini 4 Hydrogen',
        family: 'gemini-4',
        description: 'Efficient multimodal model for coding, video understanding, and everyday agentic work.',
        reasoningEffortLevels: ['low', 'medium', 'high', 'xhigh'],
        inputPrice: 1.5,
        cachedInputPrice: 0.075,
        outputPrice: 7.5
    }),
    createGeminiModel({
        modelId: 'gemini-4-carbon',
        displayName: 'Gemini 4 Carbon',
        family: 'gemini-4',
        description: 'Google’s most capable Gemini 4 reasoning model for complex and multimodal work.',
        inputPrice: 2,
        cachedInputPrice: 0.1,
        outputPrice: 10,
        pricingNotes: 'Introductory input and output rates run through November 30, 2026. Standard rates are $4 and $20 from December 1.'
    }),
    createGeminiModel({
        modelId: 'gemini-4-argon',
        displayName: 'Gemini 4 Argon',
        family: 'gemini-4',
        description: 'Efficient frontier reasoning for complex coding and multimodal tasks.',
        inputPrice: 2,
        cachedInputPrice: 0.1,
        outputPrice: 10,
        pricingNotes: 'Introductory input and output rates run through November 30, 2026. Standard rates are $4 and $20 from December 1.'
    }),
    createGeminiModel({
        modelId: 'gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash',
        family: 'gemini-3',
        description: 'Previous-generation Flash model with multimodal input.',
        reasoningEffortLevels: ['low', 'medium', 'high'],
        inputPrice: 0.75,
        cachedInputPrice: 0.075,
        outputPrice: 3.75,
        pricingNotes:
            'Introductory rates run through December 31, 2026. Standard input, cached input, and output rates are $1.50, $0.15, and $7.50 from January 1.'
    }),
    createGeminiModel({
        modelId: 'gemini-3.5-flash-lite',
        displayName: 'Gemini 3.5 Flash-Lite',
        family: 'gemini-3',
        description: 'Low-cost multimodal model for high-throughput extraction and processing.',
        reasoningEffortLevels: ['minimal', 'medium', 'high'],
        inputPrice: 0.3,
        cachedInputPrice: 0.03,
        outputPrice: 2.5
    }),
    createGeminiModel({
        modelId: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        family: 'gemini-2.5',
        description: 'Deprecated multimodal Flash model.',
        replacementModelId: 'gemini-3.5-flash-lite',
        temperaturePolicy: 'supported',
        inputPrice: 0.3,
        cachedInputPrice: 0.03,
        outputPrice: 2.5,
        pricingNotes: 'Text, image, and video rates are shown. Audio input and cached audio input have separate prices.'
    })
] as const;
