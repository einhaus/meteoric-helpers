import { AI_MODEL_CATALOG } from './aiModelCatalog.js';
import {
    AI_GLOBAL_MODEL_PROFILE_DEFAULTS,
    AI_GLOBAL_MODEL_PROFILES,
    AI_PROVIDER_MODEL_PROFILE_COST_POLICIES,
    AI_PROVIDER_MODEL_PROFILE_DEFAULTS,
    AI_PROVIDER_MODEL_PROFILES
} from './aiModelProfiles.js';
import type { AiInferenceProfileKey } from './aiInferenceProfiles.js';
import type { AiModelProfileCostPolicy, AiModelProfileDefault, AiModelProfileCostTier } from './aiModelProfiles.js';
import type {
    AiCacheWriteMode,
    AiModelCatalogEntry,
    AiModelCostEstimate,
    AiModelProfile,
    AiModelStatus,
    AiProvider
} from './aiModelTypes.js';

const AI_MODEL_CATALOG_BY_KEY = new Map(AI_MODEL_CATALOG.map((model) => [model.modelKey, model]));

export type AiModelProfileCostPolicyEvaluation = Readonly<{
    provider: AiProvider;
    profile: AiModelProfile;
    costTier: AiModelProfileCostTier;
    modelKey: string | null;
    referenceModelKey: string | null;
    isWithinPolicy: boolean;
    isApprovedHigherCost: boolean;
    approvalReason: string | null;
    inputPriceMultiplier: number | null;
    cachedInputPriceMultiplier: number | null;
    outputPriceMultiplier: number | null;
    cacheWrite5mPriceMultiplier: number | null;
    cacheWrite1hPriceMultiplier: number | null;
    violations: readonly string[];
}>;

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

function hasOwnProperty<T extends object>(value: T, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function getEffectiveLongContextRate(
    model: AiModelCatalogEntry,
    longContextRate: number | null | undefined,
    standardRate: number | null
): number | null {
    if (model.pricing.longContextThresholdInputTokens === null) return standardRate;
    return longContextRate ?? standardRate;
}

function computePriceMultiplier(candidateRate: number | null, referenceRate: number | null): number | null {
    if (candidateRate === null || referenceRate === null || referenceRate === 0) return null;
    return roundUsd(candidateRate / referenceRate);
}

function getApprovedHigherCostReason(policy: AiModelProfileCostPolicy, modelKey: string | null): string | null {
    if (!modelKey) return null;

    const approval = policy.approvedHigherCostModels.find((approvedModel) => approvedModel.modelKey === modelKey);
    const reason = approval?.reason.trim() ?? '';

    return reason ? reason : null;
}

function addRateViolation(params: {
    violations: string[];
    isApprovedHigherCost: boolean;
    label: string;
    modelKey: string;
    rate: number | null;
    maxRate: number | null;
}): void {
    if (params.maxRate === null) return;

    if (params.rate === null) {
        params.violations.push(`${params.modelKey} is missing ${params.label} pricing required by the profile cost policy.`);
        return;
    }

    if (!params.isApprovedHigherCost && params.rate > params.maxRate) {
        params.violations.push(`${params.modelKey} ${params.label} price ${params.rate} exceeds profile budget ${params.maxRate}.`);
    }
}

function addMultiplierViolation(params: {
    violations: string[];
    isApprovedHigherCost: boolean;
    label: string;
    modelKey: string;
    multiplier: number | null;
    maxMultiplier: number | null;
}): void {
    if (params.maxMultiplier === null || params.multiplier === null || params.isApprovedHigherCost) return;

    if (params.multiplier > params.maxMultiplier) {
        params.violations.push(
            `${params.modelKey} ${params.label} price multiplier ${params.multiplier} exceeds profile limit ${params.maxMultiplier}.`
        );
    }
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

export function getAiModelProfileCostPolicy(provider: AiProvider, profile: AiModelProfile): AiModelProfileCostPolicy {
    return AI_PROVIDER_MODEL_PROFILE_COST_POLICIES[provider][profile];
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

export function evaluateAiModelProfileCostPolicy(params: {
    provider: AiProvider;
    profile: AiModelProfile;
    candidateModelKey?: string | null;
}): AiModelProfileCostPolicyEvaluation {
    const policy = getAiModelProfileCostPolicy(params.provider, params.profile);
    const defaultModelKey = getPreferredAiModelKey(params.provider, params.profile);
    const modelKey = hasOwnProperty(params, 'candidateModelKey') ? (params.candidateModelKey ?? null) : defaultModelKey;
    const approvalReason = getApprovedHigherCostReason(policy, modelKey);
    const isApprovedHigherCost = approvalReason !== null;
    const violations: string[] = [];

    if (!modelKey) {
        if (policy.referenceModelKey !== null) {
            violations.push(`No preferred model is configured for ${params.provider}.${params.profile}, but the cost policy expects one.`);
        }

        return {
            provider: params.provider,
            profile: params.profile,
            costTier: policy.costTier,
            modelKey,
            referenceModelKey: policy.referenceModelKey,
            isWithinPolicy: violations.length === 0,
            isApprovedHigherCost,
            approvalReason,
            inputPriceMultiplier: null,
            cachedInputPriceMultiplier: null,
            outputPriceMultiplier: null,
            cacheWrite5mPriceMultiplier: null,
            cacheWrite1hPriceMultiplier: null,
            violations
        };
    }

    if (policy.referenceModelKey === null) {
        violations.push(`${params.provider}.${params.profile} has no cost budget for configured model ${modelKey}.`);
    }

    const model = getAiModelByKey(modelKey);
    const referenceModel = policy.referenceModelKey ? getAiModelByKey(policy.referenceModelKey) : null;

    if (!model) {
        violations.push(`${modelKey} is not present in the shared AI model catalog.`);
    }

    if (policy.referenceModelKey && !referenceModel) {
        violations.push(`${policy.referenceModelKey} is configured as a cost reference but is not present in the shared AI model catalog.`);
    }

    if (!model) {
        return {
            provider: params.provider,
            profile: params.profile,
            costTier: policy.costTier,
            modelKey,
            referenceModelKey: policy.referenceModelKey,
            isWithinPolicy: false,
            isApprovedHigherCost,
            approvalReason,
            inputPriceMultiplier: null,
            cachedInputPriceMultiplier: null,
            outputPriceMultiplier: null,
            cacheWrite5mPriceMultiplier: null,
            cacheWrite1hPriceMultiplier: null,
            violations
        };
    }

    const inputRate = model.pricing.inputUsdPerMillionTokens;
    const cachedInputRate = model.pricing.cachedInputUsdPerMillionTokens;
    const outputRate = model.pricing.outputUsdPerMillionTokens;
    const cacheWrite5mRate = model.pricing.cacheWrite5mUsdPerMillionTokens;
    const cacheWrite1hRate = model.pricing.cacheWrite1hUsdPerMillionTokens;
    const longContextInputRate = getEffectiveLongContextRate(
        model,
        model.pricing.longContextInputUsdPerMillionTokens,
        model.pricing.inputUsdPerMillionTokens
    );
    const longContextCachedInputRate = getEffectiveLongContextRate(
        model,
        model.pricing.longContextCachedInputUsdPerMillionTokens,
        model.pricing.cachedInputUsdPerMillionTokens
    );
    const longContextOutputRate = getEffectiveLongContextRate(
        model,
        model.pricing.longContextOutputUsdPerMillionTokens,
        model.pricing.outputUsdPerMillionTokens
    );

    const referenceInputRate = referenceModel?.pricing.inputUsdPerMillionTokens ?? null;
    const referenceCachedInputRate = referenceModel?.pricing.cachedInputUsdPerMillionTokens ?? null;
    const referenceOutputRate = referenceModel?.pricing.outputUsdPerMillionTokens ?? null;
    const referenceCacheWrite5mRate = referenceModel?.pricing.cacheWrite5mUsdPerMillionTokens ?? null;
    const referenceCacheWrite1hRate = referenceModel?.pricing.cacheWrite1hUsdPerMillionTokens ?? null;

    const inputPriceMultiplier = computePriceMultiplier(inputRate, referenceInputRate);
    const cachedInputPriceMultiplier = computePriceMultiplier(cachedInputRate, referenceCachedInputRate);
    const outputPriceMultiplier = computePriceMultiplier(outputRate, referenceOutputRate);
    const cacheWrite5mPriceMultiplier = computePriceMultiplier(cacheWrite5mRate, referenceCacheWrite5mRate);
    const cacheWrite1hPriceMultiplier = computePriceMultiplier(cacheWrite1hRate, referenceCacheWrite1hRate);

    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: 'input',
        modelKey,
        rate: inputRate,
        maxRate: policy.maxInputUsdPerMillionTokens
    });
    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: 'cached-input',
        modelKey,
        rate: cachedInputRate,
        maxRate: policy.maxCachedInputUsdPerMillionTokens
    });
    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: 'output',
        modelKey,
        rate: outputRate,
        maxRate: policy.maxOutputUsdPerMillionTokens
    });
    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: '5m cache-write',
        modelKey,
        rate: cacheWrite5mRate,
        maxRate: policy.maxCacheWrite5mUsdPerMillionTokens
    });
    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: '1h cache-write',
        modelKey,
        rate: cacheWrite1hRate,
        maxRate: policy.maxCacheWrite1hUsdPerMillionTokens
    });
    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: 'long-context input',
        modelKey,
        rate: longContextInputRate,
        maxRate: policy.maxLongContextInputUsdPerMillionTokens
    });
    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: 'long-context cached-input',
        modelKey,
        rate: longContextCachedInputRate,
        maxRate: policy.maxLongContextCachedInputUsdPerMillionTokens
    });
    addRateViolation({
        violations,
        isApprovedHigherCost,
        label: 'long-context output',
        modelKey,
        rate: longContextOutputRate,
        maxRate: policy.maxLongContextOutputUsdPerMillionTokens
    });

    addMultiplierViolation({
        violations,
        isApprovedHigherCost,
        label: 'input',
        modelKey,
        multiplier: inputPriceMultiplier,
        maxMultiplier: policy.maxInputPriceMultiplier
    });
    addMultiplierViolation({
        violations,
        isApprovedHigherCost,
        label: 'cached-input',
        modelKey,
        multiplier: cachedInputPriceMultiplier,
        maxMultiplier: policy.maxCachedInputPriceMultiplier
    });
    addMultiplierViolation({
        violations,
        isApprovedHigherCost,
        label: 'output',
        modelKey,
        multiplier: outputPriceMultiplier,
        maxMultiplier: policy.maxOutputPriceMultiplier
    });
    addMultiplierViolation({
        violations,
        isApprovedHigherCost,
        label: '5m cache-write',
        modelKey,
        multiplier: cacheWrite5mPriceMultiplier,
        maxMultiplier: policy.maxCacheWritePriceMultiplier
    });
    addMultiplierViolation({
        violations,
        isApprovedHigherCost,
        label: '1h cache-write',
        modelKey,
        multiplier: cacheWrite1hPriceMultiplier,
        maxMultiplier: policy.maxCacheWritePriceMultiplier
    });

    return {
        provider: params.provider,
        profile: params.profile,
        costTier: policy.costTier,
        modelKey,
        referenceModelKey: policy.referenceModelKey,
        isWithinPolicy: violations.length === 0,
        isApprovedHigherCost,
        approvalReason,
        inputPriceMultiplier,
        cachedInputPriceMultiplier,
        outputPriceMultiplier,
        cacheWrite5mPriceMultiplier,
        cacheWrite1hPriceMultiplier,
        violations
    };
}

export function listAiModelProfileCostPolicyEvaluations(): AiModelProfileCostPolicyEvaluation[] {
    const evaluations: AiModelProfileCostPolicyEvaluation[] = [];
    const providers: readonly AiProvider[] = ['openai', 'anthropic'];
    const profiles: readonly AiModelProfile[] = ['reasoning', 'balanced', 'fast', 'cheap', 'title', 'webSearch', 'deepResearch'];

    for (const provider of providers) {
        for (const profile of profiles) {
            evaluations.push(evaluateAiModelProfileCostPolicy({ provider, profile }));
        }
    }

    return evaluations;
}

export function listAiModelProfileCostPolicyViolations(): AiModelProfileCostPolicyEvaluation[] {
    return listAiModelProfileCostPolicyEvaluations().filter((evaluation) => evaluation.violations.length > 0);
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
