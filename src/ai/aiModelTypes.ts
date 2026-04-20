export type AiProvider = 'openai' | 'anthropic';

export type AiModelStatus = 'active' | 'specialized' | 'legacy' | 'deprecated' | 'retired';

export type AiModelProfile = 'reasoning' | 'balanced' | 'fast' | 'cheap' | 'title' | 'webSearch' | 'deepResearch';

export type AiReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type AiInputModality = 'text' | 'image' | 'audio' | 'video';

export type AiOutputModality = 'text' | 'image' | 'audio' | 'video';

export type AiCapabilitySupport = boolean | null;

export type AiCacheWriteMode = '5m' | '1h';

export type AiTemperaturePolicy = 'supported' | 'unsupported' | 'requiresReasoningEffortNone';

export type AiModelSource = Readonly<{
    label: string;
    url: string;
    verifiedAt: string;
}>;

export type AiModelParameterPolicies = Readonly<{
    temperature: AiTemperaturePolicy;
}>;

export type AiModelCapabilities = Readonly<{
    supportsTextInput: AiCapabilitySupport;
    supportsTextOutput: AiCapabilitySupport;
    supportsImageInput: AiCapabilitySupport;
    supportsAudioInput: AiCapabilitySupport;
    supportsAudioOutput: AiCapabilitySupport;
    supportsVision: AiCapabilitySupport;
    supportsStreaming: AiCapabilitySupport;
    supportsToolCalling: AiCapabilitySupport;
    supportsStructuredOutputs: AiCapabilitySupport;
    supportsPromptCaching: AiCapabilitySupport;
    supportsWebSearch: AiCapabilitySupport;
    supportsFileSearch: AiCapabilitySupport;
    supportsComputerUse: AiCapabilitySupport;
    supportsMcp: AiCapabilitySupport;
    supportsReasoningEffort: AiCapabilitySupport;
    reasoningEffortLevels: readonly AiReasoningEffort[];
    supportsExtendedThinking: AiCapabilitySupport;
    supportsAdaptiveThinking: AiCapabilitySupport;
}>;

export type AiModelPricing = Readonly<{
    inputUsdPerMillionTokens: number | null;
    cachedInputUsdPerMillionTokens: number | null;
    outputUsdPerMillionTokens: number | null;
    cacheWrite5mUsdPerMillionTokens: number | null;
    cacheWrite1hUsdPerMillionTokens: number | null;
    longContextThresholdInputTokens: number | null;
    longContextInputUsdPerMillionTokens: number | null;
    longContextCachedInputUsdPerMillionTokens: number | null;
    longContextOutputUsdPerMillionTokens: number | null;
    notes: string | null;
}>;

export type AiModelCatalogEntry = Readonly<{
    modelKey: string;
    provider: AiProvider;
    modelId: string;
    snapshotModelId: string | null;
    aliases: readonly string[];
    displayName: string;
    family: string;
    description: string;
    status: AiModelStatus;
    recommendedReplacementModelKey: string | null;
    inputModalities: readonly AiInputModality[];
    outputModalities: readonly AiOutputModality[];
    capabilities: AiModelCapabilities;
    contextWindowTokens: number | null;
    maxOutputTokens: number | null;
    knowledgeCutoff: string | null;
    pricing: AiModelPricing;
    sources: readonly AiModelSource[];
    tags: readonly string[];
    parameterPolicies?: AiModelParameterPolicies;
}>;

export type AiModelCostEstimate = Readonly<{
    modelKey: string;
    resolvedModelId: string;
    inputCostUsd: number;
    outputCostUsd: number;
    cacheReadCostUsd: number;
    cacheWriteCostUsd: number;
    totalCostUsd: number;
    longContextApplied: boolean;
    totalPromptTokens: number;
    cacheWriteMode: AiCacheWriteMode;
}>;
