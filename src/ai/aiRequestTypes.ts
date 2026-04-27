import type { AiInferenceProfileKey } from './aiInferenceProfiles.js';
import type { AiModelCatalogEntry, AiModelProfile, AiProvider, AiReasoningEffort } from './aiModelTypes.js';

export type AiRequestPreset =
    | 'agentChat'
    | 'analysis'
    | 'classification'
    | 'creativeWriting'
    | 'deepResearch'
    | 'sqlGeneration'
    | 'structuredExtraction'
    | 'titleGeneration'
    | 'visionExtraction'
    | 'webSearch';

export type AiToolChoiceMode = 'auto' | 'required' | 'none';

export type AiBuiltInWebSearchContextSize = 'low' | 'medium' | 'high';

export type AiRequestPresetDefinition = Readonly<{
    key: AiRequestPreset;
    description: string;
    modelProfile: AiModelProfile;
    inferenceProfileKey?: AiInferenceProfileKey | null;
    preferredProvider: AiProvider | null;
    reasoningEffort?: AiReasoningEffort | null;
    anthropicThinkingBudgetTokens?: number | null;
    temperature: number | null;
    maxOutputTokens: number | null;
    useStructuredOutputs: boolean;
    useToolCalling: boolean;
    parallelToolCalls: boolean | null;
    toolChoice: AiToolChoiceMode | null;
    useBuiltInWebSearch: boolean;
    builtInWebSearchContextSize: AiBuiltInWebSearchContextSize | null;
    tags: readonly string[];
}>;

export type AiRequestConfigOverride = Readonly<{
    model: string | null;
    modelProfile: AiModelProfile | null;
    inferenceProfileKey?: AiInferenceProfileKey | null;
    reasoningEffort: AiReasoningEffort | null;
    anthropicThinkingBudgetTokens: number | null;
    temperature: number | null;
    maxOutputTokens: number | null;
    useStructuredOutputs: boolean | null;
    useToolCalling: boolean | null;
    parallelToolCalls: boolean | null;
    toolChoice: AiToolChoiceMode | null;
    useBuiltInWebSearch: boolean | null;
    builtInWebSearchContextSize: AiBuiltInWebSearchContextSize | null;
}>;

export type AiResolvedRequestConfig = Readonly<{
    preset: AiRequestPreset;
    presetDescription: string;
    provider: AiProvider;
    modelProfile: AiModelProfile;
    inferenceProfileKey: AiInferenceProfileKey | null;
    catalogEntry: AiModelCatalogEntry | null;
    modelKey: string;
    modelId: string;
    modelDisplayName: string;
    requestedMaxOutputTokens: number | null;
    modelMaxOutputTokens: number | null;
    maxOutputTokens: number | null;
    reasoningEffort: AiReasoningEffort | null;
    anthropicThinkingBudgetTokens: number | null;
    temperature: number | null;
    useStructuredOutputs: boolean;
    useToolCalling: boolean;
    parallelToolCalls: boolean | null;
    toolChoice: AiToolChoiceMode | null;
    useBuiltInWebSearch: boolean;
    builtInWebSearchContextSize: AiBuiltInWebSearchContextSize | null;
    warnings: readonly string[];
    overridesApplied: readonly string[];
}>;
