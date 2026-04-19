import { AI_MODEL_CATALOG } from './aiModelCatalog.js';
import { AI_GLOBAL_MODEL_PROFILES, AI_PROVIDER_MODEL_PROFILES } from './aiModelProfiles.js';
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

export function listAiModels(params?: {
    provider?: AiProvider;
    statuses?: readonly AiModelStatus[];
    includeLegacy?: boolean;
    tags?: readonly string[];
}): AiModelCatalogEntry[] {
    const requestedStatuses = params?.statuses?.length ? new Set(params.statuses) : null;
    const normalizedTags = params?.tags?.map((tag) => tag.trim().toLowerCase()).filter(Boolean) ?? [];
    const includeLegacy = params?.includeLegacy ?? false;

    return AI_MODEL_CATALOG.filter((model) => {
        if (params?.provider && model.provider !== params.provider) return false;
        if (!includeLegacy && model.status === 'legacy') return false;
        if (requestedStatuses && !requestedStatuses.has(model.status)) return false;

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

export function getPreferredAiModelKey(provider: AiProvider, profile: AiModelProfile): string | null {
    return AI_PROVIDER_MODEL_PROFILES[provider][profile];
}

export function getPreferredAiModel(provider: AiProvider, profile: AiModelProfile): AiModelCatalogEntry | null {
    const modelKey = getPreferredAiModelKey(provider, profile);
    if (!modelKey) return null;
    return getAiModelByKey(modelKey);
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

    const longContextApplied =
        model.pricing.longContextThresholdInputTokens !== null && totalPromptTokens > model.pricing.longContextThresholdInputTokens;

    const inputRate = longContextApplied
        ? (model.pricing.longContextInputUsdPerMillionTokens ?? model.pricing.inputUsdPerMillionTokens)
        : model.pricing.inputUsdPerMillionTokens;

    const cacheReadRate = longContextApplied
        ? (model.pricing.longContextCachedInputUsdPerMillionTokens ?? model.pricing.cachedInputUsdPerMillionTokens)
        : model.pricing.cachedInputUsdPerMillionTokens;

    const outputRate = longContextApplied
        ? (model.pricing.longContextOutputUsdPerMillionTokens ?? model.pricing.outputUsdPerMillionTokens)
        : model.pricing.outputUsdPerMillionTokens;

    const cacheWriteRate =
        cacheWriteMode === '1h' ? model.pricing.cacheWrite1hUsdPerMillionTokens : model.pricing.cacheWrite5mUsdPerMillionTokens;

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
        longContextApplied,
        totalPromptTokens,
        cacheWriteMode
    };
}
