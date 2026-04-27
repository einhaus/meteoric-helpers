import { AI_MODEL_CATALOG } from './aiModelCatalog.js';
import {
    AI_GLOBAL_MODEL_PROFILE_DEFAULTS,
    AI_GLOBAL_MODEL_PROFILES,
    AI_PROVIDER_MODEL_PROFILE_DEFAULTS,
    AI_PROVIDER_MODEL_PROFILES
} from './aiModelProfiles.js';
import type { AiInferenceProfileKey } from './aiInferenceProfiles.js';
import type { AiModelProfileDefault } from './aiModelProfiles.js';
import type {
    AiCacheWriteMode,
    AiModelCatalogEntry,
    AiModelCostEstimate,
    AiModelProfile,
    AiModelStatus,
    AiProvider
} from './aiModelTypes.js';

const AI_MODEL_CATALOG_BY_KEY = new Map(AI_MODEL_CATALOG.map((model) => [model.modelKey, model]));

function normalizeModelIdentifier(value: string): string {
    return value.trim().toLowerCase();
}

function normalizeProvider(value: string): AiProvider | null {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'openai' || normalized === 'anthropic') return normalized;
    return null;
}

function matchesOpenAiVisionFallback(modelIdentifier: string): boolean {
    return (
        modelIdentifier.startsWith('gpt-5') ||
        modelIdentifier.startsWith('gpt-4.1') ||
        modelIdentifier.startsWith('gpt-4o') ||
        /^o\d/.test(modelIdentifier)
    );
}

function modelMatchesIdentifier(model: AiModelCatalogEntry, identifier: string): boolean {
    const normalizedIdentifier = normalizeModelIdentifier(identifier);

    if (normalizeModelIdentifier(model.modelKey) === normalizedIdentifier) return true;
    if (normalizeModelIdentifier(model.modelId) === normalizedIdentifier) return true;
    if (model.snapshotModelId && normalizeModelIdentifier(model.snapshotModelId) === normalizedIdentifier) return true;

    return model.aliases.some((alias) => normalizeModelIdentifier(alias) === normalizedIdentifier);
}

function roundUsd(value: number): number {
    return Number(value.toFixed(12));
}

function computeTokenCostUsd(tokens: number, rateUsdPerMillionTokens: number | null): number {
    if (tokens <= 0 || rateUsdPerMillionTokens === null) return 0;
    return (tokens / 1_000_000) * rateUsdPerMillionTokens;
}

export function getAiModelCatalog(): readonly AiModelCatalogEntry[] {
    return AI_MODEL_CATALOG;
}

export function getAiModelByKey(modelKey: string): AiModelCatalogEntry | null {
    const normalizedModelKey = modelKey.trim();
    if (!normalizedModelKey) return null;
    return AI_MODEL_CATALOG_BY_KEY.get(normalizedModelKey) ?? null;
}

export function getAiModelById(modelId: string, provider?: AiProvider): AiModelCatalogEntry | null {
    const trimmedModelId = modelId.trim();
    if (!trimmedModelId) return null;

    for (const model of AI_MODEL_CATALOG) {
        if (provider && model.provider !== provider) continue;
        if (modelMatchesIdentifier(model, trimmedModelId)) return model;
    }

    return null;
}

export function aiModelSupportsVision(modelIdentifier: string, provider?: AiProvider): boolean {
    const model = getAiModelByKey(modelIdentifier) ?? getAiModelById(modelIdentifier, provider) ?? getAiModelById(modelIdentifier);

    if (model) {
        return model.capabilities.supportsVision === true;
    }

    const normalizedModelIdentifier = modelIdentifier.trim().toLowerCase();
    if (!normalizedModelIdentifier) return false;

    const inferredProvider = provider ?? inferAiProviderFromModel(normalizedModelIdentifier);

    if (inferredProvider === 'anthropic') {
        return normalizedModelIdentifier.startsWith('claude-');
    }

    if (inferredProvider === 'openai') {
        return matchesOpenAiVisionFallback(normalizedModelIdentifier);
    }

    return false;
}

export function isAiAgentChatCandidate(modelIdentifier: string, provider?: AiProvider): boolean {
    const model = getAiModelByKey(modelIdentifier) ?? getAiModelById(modelIdentifier, provider) ?? getAiModelById(modelIdentifier);

    if (model) {
        const excludedStatuses = new Set<AiModelStatus>(['deprecated', 'retired']);
        if (excludedStatuses.has(model.status)) return false;
        if (model.status === 'specialized' && !model.tags.includes('agent') && !model.tags.includes('chat')) return false;
        if (model.capabilities.supportsTextInput === false || model.capabilities.supportsTextOutput === false) return false;
        if (model.capabilities.supportsStreaming === false || model.capabilities.supportsToolCalling === false) return false;
        if (model.tags.includes('deep-research')) return false;
        return true;
    }

    const normalizedModelIdentifier = modelIdentifier.trim().toLowerCase();
    if (!normalizedModelIdentifier) return false;

    const inferredProvider = provider ?? inferAiProviderFromModel(normalizedModelIdentifier);

    if (inferredProvider === 'anthropic') {
        return normalizedModelIdentifier.startsWith('claude-');
    }

    if (inferredProvider !== 'openai') return false;

    const shouldInclude =
        normalizedModelIdentifier.startsWith('gpt-5') ||
        normalizedModelIdentifier.startsWith('gpt-4o') ||
        normalizedModelIdentifier.startsWith('gpt-4.1') ||
        /^o\d/.test(normalizedModelIdentifier);

    if (!shouldInclude) return false;

    const excludeSubstrings = [
        'realtime',
        'audio',
        'transcribe',
        'tts',
        'image',
        'dall-e',
        'whisper',
        'embedding',
        'moderation',
        'search-api',
        'computer-use',
        'deep-research'
    ];

    if (excludeSubstrings.some((substring) => normalizedModelIdentifier.includes(substring))) return false;
    if (normalizedModelIdentifier.includes('-pro')) return false;

    return true;
}

export function listAiModels(params?: {
    provider?: AiProvider;
    statuses?: readonly AiModelStatus[];
    includeLegacy?: boolean;
    tags?: readonly string[];
}): AiModelCatalogEntry[] {
    const requestedStatuses = params?.statuses?.length ? new Set(params.statuses) : null;
    const normalizedTags = params?.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean) ?? [];
    const shouldIncludeLegacy = params?.includeLegacy ?? false;

    return AI_MODEL_CATALOG.filter((model) => {
        if (params?.provider && model.provider !== params.provider) return false;

        if (requestedStatuses) {
            if (!requestedStatuses.has(model.status)) return false;
        } else if (!shouldIncludeLegacy && (model.status === 'legacy' || model.status === 'deprecated' || model.status === 'retired')) {
            return false;
        }

        if (normalizedTags.length > 0) {
            const tags = new Set(model.tags.map((tag) => tag.toLowerCase()));
            if (!normalizedTags.every((tag) => tags.has(tag))) return false;
        }

        return true;
    });
}

export function inferAiProviderFromModel(modelIdentifier: string): AiProvider | null {
    const trimmedIdentifier = modelIdentifier.trim();
    if (!trimmedIdentifier) return null;

    const explicitMatch = trimmedIdentifier.match(/^(anthropic|openai)\s*:\s*(.+)$/i);

    if (explicitMatch) {
        return normalizeProvider(explicitMatch[1] ?? '');
    }

    const normalizedIdentifier = trimmedIdentifier.toLowerCase();
    if (normalizedIdentifier.includes('claude')) return 'anthropic';

    if (
        normalizedIdentifier.startsWith('gpt-') ||
        normalizedIdentifier.startsWith('chatgpt-') ||
        normalizedIdentifier.startsWith('o1') ||
        normalizedIdentifier.startsWith('o3') ||
        normalizedIdentifier.startsWith('o4') ||
        normalizedIdentifier.startsWith('codex')
    ) {
        return 'openai';
    }

    return null;
}

export function normalizeAiModelKey(modelIdentifier: string): string | null {
    const trimmedIdentifier = modelIdentifier.trim();
    if (!trimmedIdentifier) return null;

    const modelByKey = getAiModelByKey(trimmedIdentifier);
    if (modelByKey) return modelByKey.modelKey;

    const explicitMatch = trimmedIdentifier.match(/^(anthropic|openai)\s*:\s*(.+)$/i);

    if (explicitMatch) {
        const provider = normalizeProvider(explicitMatch[1] ?? '');
        const modelId = explicitMatch[2]?.trim() ?? '';

        if (!provider || !modelId) return null;

        return `${provider}:${modelId}`;
    }

    const modelById = getAiModelById(trimmedIdentifier);
    if (modelById) return modelById.modelKey;

    const provider = inferAiProviderFromModel(trimmedIdentifier);
    if (!provider) return null;

    return `${provider}:${trimmedIdentifier}`;
}

export function resolveAiModelId(model: AiModelCatalogEntry, preferSnapshot: boolean = false): string {
    if (preferSnapshot && model.snapshotModelId) return model.snapshotModelId;
    return model.modelId;
}

export function getPreferredAiModelProfileDefault(provider: AiProvider, profile: AiModelProfile): AiModelProfileDefault {
    return AI_PROVIDER_MODEL_PROFILE_DEFAULTS[provider][profile];
}

export function getPreferredAiModelKey(provider: AiProvider, profile: AiModelProfile): string | null {
    return AI_PROVIDER_MODEL_PROFILES[provider][profile];
}

export function getPreferredAiModelInferenceProfileKey(provider: AiProvider, profile: AiModelProfile): AiInferenceProfileKey | null {
    return AI_PROVIDER_MODEL_PROFILE_DEFAULTS[provider][profile].inferenceProfileKey;
}

export function getPreferredAiModel(provider: AiProvider, profile: AiModelProfile): AiModelCatalogEntry | null {
    const modelKey = getPreferredAiModelKey(provider, profile);
    if (!modelKey) return null;
    return getAiModelByKey(modelKey);
}

export function getPreferredAiModelProfileConfig(params: {
    provider?: AiProvider;
    profile: AiModelProfile;
}): (AiModelProfileDefault & { model: AiModelCatalogEntry | null }) | null {
    const profileDefault = params.provider
        ? AI_PROVIDER_MODEL_PROFILE_DEFAULTS[params.provider][params.profile]
        : AI_GLOBAL_MODEL_PROFILE_DEFAULTS[params.profile];

    if (!profileDefault.modelKey) {
        return {
            ...profileDefault,
            model: null
        };
    }

    return {
        ...profileDefault,
        model: getAiModelByKey(profileDefault.modelKey)
    };
}

export function getPreferredAiModelId(params: { provider?: AiProvider; profile: AiModelProfile; preferSnapshot?: boolean }): string | null {
    const { provider } = params;
    const modelKey = provider ? AI_PROVIDER_MODEL_PROFILES[provider][params.profile] : AI_GLOBAL_MODEL_PROFILES[params.profile];
    if (!modelKey) return null;

    const model = getAiModelByKey(modelKey);
    if (!model) return null;

    return resolveAiModelId(model, params.preferSnapshot ?? false);
}

export function estimateAiModelCostUsd(params: {
    model: string;
    provider?: AiProvider;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
    cacheWriteMode?: AiCacheWriteMode;
}): AiModelCostEstimate | null {
    const cacheReadInputTokens = params.cacheReadInputTokens ?? 0;
    const cacheWriteInputTokens = params.cacheWriteInputTokens ?? 0;
    const cacheWriteMode = params.cacheWriteMode ?? '5m';

    const model =
        getAiModelByKey(params.model) ??
        getAiModelById(params.model, params.provider) ??
        (() => {
            const normalizedModelKey = normalizeAiModelKey(params.model);
            return normalizedModelKey ? getAiModelByKey(normalizedModelKey) : null;
        })();

    if (!model) return null;

    const totalPromptTokens = params.inputTokens + cacheReadInputTokens + cacheWriteInputTokens;

    const isLongContextApplied =
        model.pricing.longContextThresholdInputTokens !== null && totalPromptTokens > model.pricing.longContextThresholdInputTokens;

    const inputRate = isLongContextApplied
        ? (model.pricing.longContextInputUsdPerMillionTokens ?? model.pricing.inputUsdPerMillionTokens)
        : model.pricing.inputUsdPerMillionTokens;

    const cacheReadRate = isLongContextApplied
        ? (model.pricing.longContextCachedInputUsdPerMillionTokens ?? model.pricing.cachedInputUsdPerMillionTokens)
        : model.pricing.cachedInputUsdPerMillionTokens;

    const outputRate = isLongContextApplied
        ? (model.pricing.longContextOutputUsdPerMillionTokens ?? model.pricing.outputUsdPerMillionTokens)
        : model.pricing.outputUsdPerMillionTokens;

    const cacheWriteRate = isLongContextApplied
        ? cacheWriteMode === '1h'
            ? (model.pricing.longContextCacheWrite1hUsdPerMillionTokens ?? model.pricing.cacheWrite1hUsdPerMillionTokens)
            : (model.pricing.longContextCacheWrite5mUsdPerMillionTokens ?? model.pricing.cacheWrite5mUsdPerMillionTokens)
        : cacheWriteMode === '1h'
          ? model.pricing.cacheWrite1hUsdPerMillionTokens
          : model.pricing.cacheWrite5mUsdPerMillionTokens;

    if (inputRate === null && cacheReadRate === null && cacheWriteRate === null && outputRate === null) {
        return null;
    }

    const inputCostUsd = computeTokenCostUsd(params.inputTokens, inputRate);
    const outputCostUsd = computeTokenCostUsd(params.outputTokens, outputRate);
    const cacheReadCostUsd = computeTokenCostUsd(cacheReadInputTokens, cacheReadRate);
    const cacheWriteCostUsd = computeTokenCostUsd(cacheWriteInputTokens, cacheWriteRate);
    const totalCostUsd = inputCostUsd + outputCostUsd + cacheReadCostUsd + cacheWriteCostUsd;

    return {
        modelKey: model.modelKey,
        resolvedModelId: model.modelId,
        inputCostUsd: roundUsd(inputCostUsd),
        outputCostUsd: roundUsd(outputCostUsd),
        cacheReadCostUsd: roundUsd(cacheReadCostUsd),
        cacheWriteCostUsd: roundUsd(cacheWriteCostUsd),
        totalCostUsd: roundUsd(totalCostUsd),
        longContextApplied: isLongContextApplied,
        totalPromptTokens,
        cacheWriteMode
    };
}
