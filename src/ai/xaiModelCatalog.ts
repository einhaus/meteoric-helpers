import type { AiInputModality, AiModelCapabilities, AiModelCatalogEntry, AiModelStatus, AiTemperaturePolicy } from './aiModelTypes.js';

const XAI_VERIFIED_AT = '2026-11-21';

const xaiSource = (label: string, path: string) => ({
    label,
    url: `https://docs.x.ai/${path}`,
    verifiedAt: XAI_VERIFIED_AT
});

const XAI_LONG_CONTEXT_NOTES =
    'Prompts over 200,000 tokens are billed at 2x standard input, cached input, and output rates. US regional endpoints add a 10% premium.';

const createXaiModel = (params: {
    modelId: string;
    aliases?: readonly string[];
    displayName: string;
    family: string;
    description: string;
    status?: AiModelStatus;
    replacementModelId?: string;
    inputModalities?: readonly AiInputModality[];
    contextWindowTokens: number;
    maxOutputTokens?: number | null;
    reasoningEffortLevels?: AiModelCapabilities['reasoningEffortLevels'];
    supportsReasoningEffort?: boolean;
    supportsVision?: boolean;
    supportsWebSearch?: boolean;
    inputPrice: number;
    cachedInputPrice: number;
    outputPrice: number;
    longContextThresholdInputTokens?: number | null;
    longContextMultiplier?: number;
    pricingNotes?: string | null;
    temperaturePolicy?: AiTemperaturePolicy;
    tags: readonly string[];
}): AiModelCatalogEntry<'xai'> => {
    const inputModalities = params.inputModalities ?? (params.supportsVision === false ? ['text'] : ['text', 'image']);
    const supportsVision = params.supportsVision ?? inputModalities.includes('image');
    const longContextThreshold = params.longContextThresholdInputTokens ?? null;
    const longContextMultiplier = params.longContextMultiplier ?? 2;

    return {
        modelKey: `xai:${params.modelId}`,
        provider: 'xai',
        modelId: params.modelId,
        snapshotModelId: null,
        aliases: params.aliases ?? [],
        displayName: params.displayName,
        family: params.family,
        description: params.description,
        status: params.status ?? (params.replacementModelId ? 'legacy' : 'active'),
        recommendedReplacementModelKey: params.replacementModelId ? `xai:${params.replacementModelId}` : null,
        inputModalities,
        outputModalities: ['text'],
        capabilities: {
            supportsTextInput: true,
            supportsTextOutput: true,
            supportsImageInput: supportsVision,
            supportsAudioInput: false,
            supportsAudioOutput: false,
            supportsVision,
            supportsStreaming: true,
            supportsToolCalling: true,
            supportsStructuredOutputs: true,
            supportsPromptCaching: true,
            supportsWebSearch: params.supportsWebSearch ?? true,
            supportsFileSearch: null,
            supportsComputerUse: null,
            supportsMcp: null,
            supportsReasoningEffort: params.supportsReasoningEffort ?? Boolean(params.reasoningEffortLevels?.length),
            reasoningEffortLevels: params.reasoningEffortLevels ?? [],
            supportsExtendedThinking: false,
            supportsAdaptiveThinking: false
        },
        contextWindowTokens: params.contextWindowTokens,
        maxOutputTokens: params.maxOutputTokens ?? null,
        knowledgeCutoff: null,
        pricing: {
            inputUsdPerMillionTokens: params.inputPrice,
            cachedInputUsdPerMillionTokens: params.cachedInputPrice,
            outputUsdPerMillionTokens: params.outputPrice,
            cacheWrite5mUsdPerMillionTokens: null,
            cacheWrite1hUsdPerMillionTokens: null,
            longContextThresholdInputTokens: longContextThreshold,
            longContextInputUsdPerMillionTokens: longContextThreshold !== null ? params.inputPrice * longContextMultiplier : null,
            longContextCachedInputUsdPerMillionTokens:
                longContextThreshold !== null ? params.cachedInputPrice * longContextMultiplier : null,
            longContextOutputUsdPerMillionTokens: longContextThreshold !== null ? params.outputPrice * longContextMultiplier : null,
            notes: params.pricingNotes ?? (longContextThreshold !== null ? XAI_LONG_CONTEXT_NOTES : null)
        },
        sources: [xaiSource('xAI models documentation', 'docs/models'), xaiSource('xAI API pricing', 'docs/models#models-and-pricing')],
        tags: params.tags,
        parameterPolicies: { temperature: params.temperaturePolicy ?? 'supported' }
    };
};

export const XAI_MODEL_CATALOG: readonly AiModelCatalogEntry<'xai'>[] = [
    createXaiModel({
        modelId: 'grok-4.7',
        displayName: 'Grok 4.7',
        family: 'grok-4',
        description: 'xAI’s flagship reasoning model for agentic coding, complex workflows, and multimodal knowledge work.',
        contextWindowTokens: 500_000,
        reasoningEffortLevels: ['none', 'low', 'medium', 'high', 'xhigh'],
        inputPrice: 2,
        cachedInputPrice: 0.5,
        outputPrice: 6,
        longContextThresholdInputTokens: 200_000,
        tags: ['flagship', 'reasoning', 'multimodal', 'agent', 'coding']
    }),
    createXaiModel({
        modelId: 'grok-4.6',
        displayName: 'Grok 4.6',
        family: 'grok-4',
        description: 'Previous flagship Grok 4 reasoning model superseded by Grok 4.7.',
        replacementModelId: 'grok-4.7',
        contextWindowTokens: 500_000,
        reasoningEffortLevels: ['low', 'medium', 'high', 'xhigh'],
        inputPrice: 2,
        cachedInputPrice: 0.5,
        outputPrice: 6,
        longContextThresholdInputTokens: 200_000,
        tags: ['legacy', 'reasoning', 'multimodal']
    }),
    createXaiModel({
        modelId: 'grok-4.5',
        displayName: 'Grok 4.5',
        family: 'grok-4',
        description: 'Earlier Grok 4 flagship reasoning model superseded by Grok 4.7.',
        replacementModelId: 'grok-4.7',
        contextWindowTokens: 500_000,
        reasoningEffortLevels: ['low', 'medium', 'high', 'xhigh'],
        inputPrice: 2,
        cachedInputPrice: 0.3,
        outputPrice: 6,
        longContextThresholdInputTokens: 200_000,
        tags: ['legacy', 'reasoning', 'multimodal']
    }),
    createXaiModel({
        modelId: 'grok-4.3',
        aliases: ['grok-4.3-0815'],
        displayName: 'Grok 4.3',
        family: 'grok-4',
        description: 'High-context 1M-token Grok 4 reasoning model for long-document analysis and multi-turn research.',
        contextWindowTokens: 1_000_000,
        supportsReasoningEffort: false,
        inputPrice: 1.25,
        cachedInputPrice: 0.2,
        outputPrice: 2.5,
        longContextThresholdInputTokens: 200_000,
        tags: ['balanced', 'reasoning', 'long-context', 'multimodal']
    }),
    createXaiModel({
        modelId: 'grok-4.20-0309-reasoning',
        aliases: ['grok-4.20-reasoning', 'grok-4.20'],
        displayName: 'Grok 4.20 Reasoning',
        family: 'grok-4',
        description: 'Previous 1M-token Grok 4 reasoning checkpoint superseded by Grok 4.3.',
        replacementModelId: 'grok-4.3',
        contextWindowTokens: 1_000_000,
        supportsReasoningEffort: false,
        inputPrice: 1.25,
        cachedInputPrice: 0.2,
        outputPrice: 2.5,
        longContextThresholdInputTokens: 200_000,
        tags: ['legacy', 'reasoning', 'long-context', 'multimodal']
    }),
    createXaiModel({
        modelId: 'grok-4.20-0309-non-reasoning',
        aliases: ['grok-4.20-non-reasoning'],
        displayName: 'Grok 4.20 Non-Reasoning',
        family: 'grok-4',
        description: 'Non-reasoning 1M-token Grok 4 model for lower-latency long-context generation and extraction.',
        contextWindowTokens: 1_000_000,
        supportsReasoningEffort: false,
        inputPrice: 1.25,
        cachedInputPrice: 0.2,
        outputPrice: 2.5,
        longContextThresholdInputTokens: 200_000,
        tags: ['balanced', 'long-context', 'multimodal']
    }),
    createXaiModel({
        modelId: 'grok-4-1-fast-reasoning',
        displayName: 'Grok 4.1 Fast Reasoning',
        family: 'grok-4-fast',
        description: 'Low-latency, low-cost 2M-token agentic reasoning model for fast tool calling and search.',
        contextWindowTokens: 2_000_000,
        supportsReasoningEffort: false,
        inputPrice: 0.2,
        cachedInputPrice: 0.05,
        outputPrice: 0.5,
        pricingNotes: 'US regional endpoints add a 10% premium.',
        tags: ['fast', 'cheap', 'reasoning', 'agent', 'long-context', 'multimodal']
    }),
    createXaiModel({
        modelId: 'grok-4-1-fast-non-reasoning',
        displayName: 'Grok 4.1 Fast Non-Reasoning',
        family: 'grok-4-fast',
        description: 'Lowest-latency 2M-token Grok model for high-volume classification, routing, and titles.',
        contextWindowTokens: 2_000_000,
        supportsReasoningEffort: false,
        inputPrice: 0.2,
        cachedInputPrice: 0.05,
        outputPrice: 0.5,
        pricingNotes: 'US regional endpoints add a 10% premium.',
        tags: ['fast', 'cheap', 'long-context', 'multimodal']
    }),
    createXaiModel({
        modelId: 'grok-build-0.1',
        displayName: 'Grok Build 0.1',
        family: 'grok-build',
        description: 'High-throughput coding model tuned for agentic software engineering and debugging workflows.',
        status: 'specialized',
        supportsVision: false,
        contextWindowTokens: 256_000,
        supportsReasoningEffort: false,
        inputPrice: 1,
        cachedInputPrice: 0.2,
        outputPrice: 2,
        longContextThresholdInputTokens: 200_000,
        tags: ['coding', 'agent']
    }),
    createXaiModel({
        modelId: 'grok-code-fast-1',
        displayName: 'Grok Code Fast 1',
        family: 'grok-code',
        description: 'Fast, economical reasoning model tuned for high-volume agentic coding workflows.',
        status: 'specialized',
        supportsVision: false,
        contextWindowTokens: 256_000,
        maxOutputTokens: 10_000,
        supportsReasoningEffort: false,
        inputPrice: 0.2,
        cachedInputPrice: 0.02,
        outputPrice: 1.5,
        pricingNotes: 'Launch rate shown; rates can vary by regional endpoint or priority tier.',
        tags: ['coding', 'agent', 'fast']
    })
] as const;
