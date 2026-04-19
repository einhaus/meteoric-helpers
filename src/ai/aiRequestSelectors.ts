import { AI_REQUEST_PRESETS } from './aiRequestPresets.js';
import { getAiModelById, getAiModelByKey, getPreferredAiModel, inferAiProviderFromModel, normalizeAiModelKey, resolveAiModelId } from './aiModelSelectors.js';
import type { AiModelCatalogEntry, AiModelProfile, AiProvider } from './aiModelTypes.js';
import type { AiRequestConfigOverride, AiRequestPreset, AiRequestPresetDefinition, AiResolvedRequestConfig } from './aiRequestTypes.js';

const AI_REQUEST_PRESETS_BY_KEY = new Map(AI_REQUEST_PRESETS.map((preset) => [preset.key, preset]));

function normalizeNonEmptyString(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? '';
    return normalized ? normalized : null;
}

function resolveOverride<T>(params: {
    overrideValue: T | null | undefined;
    presetValue: T;
    fieldName: keyof AiRequestConfigOverride;
    overridesApplied: string[];
}): T {
    if (params.overrideValue !== null && params.overrideValue !== undefined) {
        params.overridesApplied.push(String(params.fieldName));
        return params.overrideValue;
    }

    return params.presetValue;
}

function buildUnknownModelResult(params: {
    explicitModel: string;
    provider: AiProvider;
    warnings: string[];
}): { catalogEntry: AiModelCatalogEntry | null; modelKey: string; modelId: string; modelDisplayName: string } {
    const explicitModel = params.explicitModel.trim();
    const providerPrefixedMatch = explicitModel.match(/^(anthropic|openai)\s*:\s*(.+)$/i);

    const modelId = providerPrefixedMatch?.[2]?.trim() || explicitModel;
    const normalizedModelKey = normalizeAiModelKey(explicitModel) ?? `${params.provider}:${modelId}`;

    params.warnings.push(
        `Model override "${explicitModel}" was not found in the shared catalog; capability validation and max-output clamping were skipped.`
    );

    return {
        catalogEntry: null,
        modelKey: normalizedModelKey,
        modelId,
        modelDisplayName: modelId
    };
}

function resolveProvider(params: {
    requestedProvider: AiProvider | undefined;
    explicitModel: string | null;
    preset: AiRequestPresetDefinition;
}): AiProvider {
    if (params.requestedProvider) return params.requestedProvider;

    if (params.explicitModel) {
        const inferredProvider = inferAiProviderFromModel(params.explicitModel);
        if (inferredProvider) return inferredProvider;

        const matchingCatalogModel = getAiModelByKey(params.explicitModel) ?? getAiModelById(params.explicitModel);
        if (matchingCatalogModel) return matchingCatalogModel.provider;
    }

    return params.preset.preferredProvider ?? 'openai';
}

function resolveCatalogModel(params: {
    provider: AiProvider;
    explicitModel: string | null;
    modelProfile: AiModelProfile;
    warnings: string[];
}): { catalogEntry: AiModelCatalogEntry | null; modelKey: string; modelId: string; modelDisplayName: string } {
    if (params.explicitModel) {
        const matchingCatalogModel = getAiModelByKey(params.explicitModel) ?? getAiModelById(params.explicitModel, params.provider) ?? getAiModelById(params.explicitModel);

        if (matchingCatalogModel) {
            if (matchingCatalogModel.provider !== params.provider) {
                throw new Error(
                    `Explicit model "${params.explicitModel}" resolves to provider "${matchingCatalogModel.provider}", which does not match requested provider "${params.provider}".`
                );
            }

            return {
                catalogEntry: matchingCatalogModel,
                modelKey: matchingCatalogModel.modelKey,
                modelId: matchingCatalogModel.modelId,
                modelDisplayName: matchingCatalogModel.displayName
            };
        }

        return buildUnknownModelResult({
            explicitModel: params.explicitModel,
            provider: params.provider,
            warnings: params.warnings
        });
    }

    const preferredModel = getPreferredAiModel(params.provider, params.modelProfile);
    if (!preferredModel) {
        throw new Error(
            `No preferred model is configured for provider "${params.provider}" and profile "${params.modelProfile}". Supply an explicit model override or update aiModelProfiles.ts.`
        );
    }

    return {
        catalogEntry: preferredModel,
        modelKey: preferredModel.modelKey,
        modelId: preferredModel.modelId,
        modelDisplayName: preferredModel.displayName
    };
}

function maybeDisableStructuredOutputs(params: {
    requested: boolean;
    catalogEntry: AiModelCatalogEntry | null;
    warnings: string[];
}): boolean {
    if (!params.requested) return false;
    if (!params.catalogEntry) return true;
    if (params.catalogEntry.capabilities.supportsStructuredOutputs === false) {
        params.warnings.push(`Structured outputs were disabled because ${params.catalogEntry.modelKey} does not advertise structured-output support.`);
        return false;
    }

    return true;
}

function maybeDisableToolCalling(params: {
    requested: boolean;
    catalogEntry: AiModelCatalogEntry | null;
    warnings: string[];
}): boolean {
    if (!params.requested) return false;
    if (!params.catalogEntry) return true;
    if (params.catalogEntry.capabilities.supportsToolCalling === false) {
        params.warnings.push(`Tool calling was disabled because ${params.catalogEntry.modelKey} does not advertise tool-calling support.`);
        return false;
    }

    return true;
}

function maybeDisableBuiltInWebSearch(params: {
    requested: boolean;
    catalogEntry: AiModelCatalogEntry | null;
    warnings: string[];
}): boolean {
    if (!params.requested) return false;
    if (!params.catalogEntry) return true;
    if (params.catalogEntry.capabilities.supportsWebSearch === false) {
        params.warnings.push(`Built-in web search was disabled because ${params.catalogEntry.modelKey} does not advertise web-search support.`);
        return false;
    }

    return true;
}

function clampMaxOutputTokens(params: {
    requestedMaxOutputTokens: number | null;
    catalogEntry: AiModelCatalogEntry | null;
    warnings: string[];
}): number | null {
    const modelMaxOutputTokens = params.catalogEntry?.maxOutputTokens ?? null;

    if (params.requestedMaxOutputTokens === null || params.requestedMaxOutputTokens === undefined) {
        return modelMaxOutputTokens;
    }

    if (modelMaxOutputTokens !== null && params.requestedMaxOutputTokens > modelMaxOutputTokens) {
        params.warnings.push(
            `Requested max output tokens (${params.requestedMaxOutputTokens}) were capped to the model maximum (${modelMaxOutputTokens}).`
        );
        return modelMaxOutputTokens;
    }

    return params.requestedMaxOutputTokens;
}

function resolveReasoningEffort(params: {
    requestedReasoningEffort: AiResolvedRequestConfig['reasoningEffort'];
    catalogEntry: AiModelCatalogEntry | null;
    warnings: string[];
}): AiResolvedRequestConfig['reasoningEffort'] {
    if (!params.requestedReasoningEffort) return null;
    if (!params.catalogEntry) return params.requestedReasoningEffort;

    if (params.catalogEntry.capabilities.supportsReasoningEffort === false) {
        params.warnings.push(`Reasoning effort was cleared because ${params.catalogEntry.modelKey} uses a different reasoning/thinking interface.`);
        return null;
    }

    const supportedLevels = params.catalogEntry.capabilities.reasoningEffortLevels;

    if (supportedLevels.length > 0 && !supportedLevels.includes(params.requestedReasoningEffort)) {
        params.warnings.push(
            `Reasoning effort "${params.requestedReasoningEffort}" was cleared because ${params.catalogEntry.modelKey} supports only: ${supportedLevels.join(', ')}.`
        );
        return null;
    }

    return params.requestedReasoningEffort;
}

function resolveAnthropicThinkingBudgetTokens(params: {
    provider: AiProvider;
    requestedBudgetTokens: number | null;
    catalogEntry: AiModelCatalogEntry | null;
    warnings: string[];
}): number | null {
    if (params.requestedBudgetTokens === null || params.requestedBudgetTokens === undefined) return null;

    if (params.provider !== 'anthropic') {
        params.warnings.push('Anthropic thinking budget tokens were cleared because the resolved provider is not Anthropic.');
        return null;
    }

    if (!params.catalogEntry) return params.requestedBudgetTokens;

    if (params.catalogEntry.capabilities.supportsExtendedThinking === false) {
        params.warnings.push(`Anthropic thinking budget tokens were cleared because ${params.catalogEntry.modelKey} does not advertise extended-thinking support.`);
        return null;
    }

    return params.requestedBudgetTokens;
}

export function getAiRequestPreset(preset: AiRequestPreset): AiRequestPresetDefinition {
    const matchingPreset = AI_REQUEST_PRESETS_BY_KEY.get(preset);
    if (!matchingPreset) throw new Error(`Unknown AI request preset: ${preset}`);
    return matchingPreset;
}

export function listAiRequestPresets(params?: {
    provider?: AiProvider;
    tags?: readonly string[];
}): AiRequestPresetDefinition[] {
    const normalizedTags = params?.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean) ?? [];

    return AI_REQUEST_PRESETS.filter((preset) => {
        if (params?.provider && preset.preferredProvider && preset.preferredProvider !== params.provider) return false;

        if (normalizedTags.length > 0) {
            const presetTags = new Set(preset.tags.map((tag) => tag.toLowerCase()));
            if (!normalizedTags.every((tag) => presetTags.has(tag))) return false;
        }

        return true;
    });
}

export function resolveAiRequestConfig(
    params: { preset: AiRequestPreset; provider?: AiProvider; preferSnapshot?: boolean } & Partial<AiRequestConfigOverride>
): AiResolvedRequestConfig {
    const preset = getAiRequestPreset(params.preset);
    const warnings: string[] = [];
    const overridesApplied: string[] = [];
    const explicitModel = normalizeNonEmptyString(params.model);
    const provider = resolveProvider({
        requestedProvider: params.provider,
        explicitModel,
        preset
    });

    const modelProfile = resolveOverride({
        overrideValue: params.modelProfile,
        presetValue: preset.modelProfile,
        fieldName: 'modelProfile',
        overridesApplied
    });

    const resolvedModel = resolveCatalogModel({
        provider,
        explicitModel,
        modelProfile,
        warnings
    });

    const requestedReasoningEffort = resolveOverride({
        overrideValue: params.reasoningEffort,
        presetValue: preset.reasoningEffort,
        fieldName: 'reasoningEffort',
        overridesApplied
    });

    const presetAnthropicThinkingBudgetTokens = provider === 'anthropic' ? preset.anthropicThinkingBudgetTokens : null;

    const requestedAnthropicThinkingBudgetTokens = resolveOverride({
        overrideValue: params.anthropicThinkingBudgetTokens,
        presetValue: presetAnthropicThinkingBudgetTokens,
        fieldName: 'anthropicThinkingBudgetTokens',
        overridesApplied
    });

    const temperature = resolveOverride({
        overrideValue: params.temperature,
        presetValue: preset.temperature,
        fieldName: 'temperature',
        overridesApplied
    });

    const requestedMaxOutputTokens = resolveOverride({
        overrideValue: params.maxOutputTokens,
        presetValue: preset.maxOutputTokens,
        fieldName: 'maxOutputTokens',
        overridesApplied
    });

    const requestedStructuredOutputs = resolveOverride({
        overrideValue: params.useStructuredOutputs,
        presetValue: preset.useStructuredOutputs,
        fieldName: 'useStructuredOutputs',
        overridesApplied
    });

    const requestedToolCalling = resolveOverride({
        overrideValue: params.useToolCalling,
        presetValue: preset.useToolCalling,
        fieldName: 'useToolCalling',
        overridesApplied
    });

    const requestedParallelToolCalls = resolveOverride({
        overrideValue: params.parallelToolCalls,
        presetValue: preset.parallelToolCalls,
        fieldName: 'parallelToolCalls',
        overridesApplied
    });

    const requestedToolChoice = resolveOverride({
        overrideValue: params.toolChoice,
        presetValue: preset.toolChoice,
        fieldName: 'toolChoice',
        overridesApplied
    });

    const requestedBuiltInWebSearch = resolveOverride({
        overrideValue: params.useBuiltInWebSearch,
        presetValue: preset.useBuiltInWebSearch,
        fieldName: 'useBuiltInWebSearch',
        overridesApplied
    });

    const requestedBuiltInWebSearchContextSize = resolveOverride({
        overrideValue: params.builtInWebSearchContextSize,
        presetValue: preset.builtInWebSearchContextSize,
        fieldName: 'builtInWebSearchContextSize',
        overridesApplied
    });

    const useStructuredOutputs = maybeDisableStructuredOutputs({
        requested: requestedStructuredOutputs,
        catalogEntry: resolvedModel.catalogEntry,
        warnings
    });

    const useToolCalling = maybeDisableToolCalling({
        requested: requestedToolCalling,
        catalogEntry: resolvedModel.catalogEntry,
        warnings
    });

    const useBuiltInWebSearch = maybeDisableBuiltInWebSearch({
        requested: requestedBuiltInWebSearch,
        catalogEntry: resolvedModel.catalogEntry,
        warnings
    });

    const reasoningEffort = resolveReasoningEffort({
        requestedReasoningEffort,
        catalogEntry: resolvedModel.catalogEntry,
        warnings
    });

    const anthropicThinkingBudgetTokens = resolveAnthropicThinkingBudgetTokens({
        provider,
        requestedBudgetTokens: requestedAnthropicThinkingBudgetTokens,
        catalogEntry: resolvedModel.catalogEntry,
        warnings
    });

    const maxOutputTokens = clampMaxOutputTokens({
        requestedMaxOutputTokens,
        catalogEntry: resolvedModel.catalogEntry,
        warnings
    });

    const parallelToolCalls = useToolCalling ? requestedParallelToolCalls : null;
    const toolChoice = useToolCalling ? requestedToolChoice : 'none';
    const builtInWebSearchContextSize = useBuiltInWebSearch ? requestedBuiltInWebSearchContextSize : null;

    return {
        preset: preset.key,
        presetDescription: preset.description,
        provider,
        modelProfile,
        catalogEntry: resolvedModel.catalogEntry,
        modelKey: resolvedModel.catalogEntry?.modelKey ?? resolvedModel.modelKey,
        modelId: resolvedModel.catalogEntry ? resolveAiModelId(resolvedModel.catalogEntry, params.preferSnapshot ?? false) : resolvedModel.modelId,
        modelDisplayName: resolvedModel.modelDisplayName,
        requestedMaxOutputTokens,
        modelMaxOutputTokens: resolvedModel.catalogEntry?.maxOutputTokens ?? null,
        maxOutputTokens,
        reasoningEffort,
        anthropicThinkingBudgetTokens,
        temperature,
        useStructuredOutputs,
        useToolCalling,
        parallelToolCalls,
        toolChoice,
        useBuiltInWebSearch,
        builtInWebSearchContextSize,
        warnings,
        overridesApplied
    };
}
