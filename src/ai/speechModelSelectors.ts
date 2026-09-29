import { SPEECH_MODEL_CATALOG } from './speechModelCatalog.js';
import {
    SPEECH_PROVIDER_MODEL_PROFILE_COST_POLICIES,
    SPEECH_PROVIDER_MODEL_PROFILES,
    type SpeechModelProfileCostPolicy
} from './speechModelProfiles.js';
import type { AiModelStatus } from './aiModelTypes.js';
import type { SpeechModelCatalogEntry, SpeechModelProfile, SpeechProvider, SpeechResolvedModelConfig } from './speechModelTypes.js';

const SPEECH_MODEL_CATALOG_BY_KEY = new Map(SPEECH_MODEL_CATALOG.map((model) => [model.modelKey, model]));
const SPEECH_PROVIDERS: readonly SpeechProvider[] = ['elevenlabs'];
const DEFAULT_SPEECH_PROVIDER: SpeechProvider = 'elevenlabs';
const OUTDATED_SPEECH_MODEL_STATUSES: ReadonlySet<AiModelStatus> = new Set(['deprecated', 'retired']);

export type SpeechModelProfileCostPolicyEvaluation = Readonly<{
    provider: SpeechProvider;
    profile: SpeechModelProfile;
    modelKey: string | null;
    characterCostMultiplier: number | null;
    maxCharacterCostMultiplier: number | null;
    isWithinPolicy: boolean;
    violations: readonly string[];
}>;

function normalizeModelIdentifier(value: string): string {
    return value.trim().toLowerCase();
}

function normalizeNonEmptyString(value: string | null | undefined): string | null {
    const normalized = value?.trim() ?? '';
    return normalized ? normalized : null;
}

function normalizeSpeechProvider(value: string): SpeechProvider | null {
    const normalized = normalizeModelIdentifier(value);
    return SPEECH_PROVIDERS.find((provider) => provider === normalized) ?? null;
}

function splitProviderPrefix(modelIdentifier: string): { provider: SpeechProvider | null; modelIdentifier: string } {
    const separatorIndex = modelIdentifier.indexOf(':');
    if (separatorIndex === -1) {
        return { provider: null, modelIdentifier };
    }

    const provider = normalizeSpeechProvider(modelIdentifier.slice(0, separatorIndex));
    if (!provider) {
        return { provider: null, modelIdentifier };
    }

    return { provider, modelIdentifier: modelIdentifier.slice(separatorIndex + 1) };
}

function modelMatchesIdentifier(model: SpeechModelCatalogEntry, identifier: string): boolean {
    const normalizedIdentifier = normalizeModelIdentifier(identifier);

    if (normalizeModelIdentifier(model.modelKey) === normalizedIdentifier) return true;
    if (normalizeModelIdentifier(model.modelId) === normalizedIdentifier) return true;

    return model.aliases.some((alias) => normalizeModelIdentifier(alias) === normalizedIdentifier);
}

function hasOwnProperty<T extends object>(value: T, key: PropertyKey): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function buildResolvedConfig(params: {
    provider: SpeechProvider;
    profile: SpeechModelProfile;
    requestedModel: string | null;
    modelKey: string | null;
    modelId: string;
    catalogEntry: SpeechModelCatalogEntry | null;
    warnings: string[];
    overridesApplied: string[];
}): SpeechResolvedModelConfig {
    return {
        provider: params.provider,
        profile: params.profile,
        requestedModel: params.requestedModel,
        modelKey: params.modelKey,
        modelId: params.modelId,
        catalogEntry: params.catalogEntry,
        warnings: params.warnings,
        overridesApplied: params.overridesApplied
    };
}

export function getSpeechModelCatalog(): readonly SpeechModelCatalogEntry[] {
    return SPEECH_MODEL_CATALOG;
}

export function getSpeechModelByKey(modelKey: string): SpeechModelCatalogEntry | null {
    return SPEECH_MODEL_CATALOG_BY_KEY.get(modelKey) ?? SPEECH_MODEL_CATALOG_BY_KEY.get(normalizeModelIdentifier(modelKey)) ?? null;
}

export function getSpeechModelById(modelId: string, provider?: SpeechProvider): SpeechModelCatalogEntry | null {
    const candidates = provider ? SPEECH_MODEL_CATALOG.filter((model) => model.provider === provider) : SPEECH_MODEL_CATALOG;
    return candidates.find((model) => modelMatchesIdentifier(model, modelId)) ?? null;
}

export function listSpeechModels(params?: {
    provider?: SpeechProvider;
    statuses?: readonly AiModelStatus[];
    tags?: readonly string[];
}): SpeechModelCatalogEntry[] {
    const statuses = params?.statuses ? new Set(params.statuses) : null;
    const tags = params?.tags ?? [];

    return SPEECH_MODEL_CATALOG.filter((model) => {
        if (params?.provider && model.provider !== params.provider) return false;
        if (statuses && !statuses.has(model.status)) return false;
        return tags.every((tag) => model.tags.includes(tag));
    });
}

export function inferSpeechProviderFromModel(modelIdentifier: string): SpeechProvider | null {
    const trimmed = modelIdentifier.trim();
    if (!trimmed) return null;

    const { provider, modelIdentifier: bareIdentifier } = splitProviderPrefix(trimmed);
    if (provider) return provider;

    if (normalizeModelIdentifier(bareIdentifier).startsWith('eleven_')) return 'elevenlabs';

    return getSpeechModelById(bareIdentifier)?.provider ?? null;
}

export function normalizeSpeechModelKey(modelIdentifier: string): string | null {
    const trimmed = modelIdentifier.trim();
    if (!trimmed) return null;

    const { provider, modelIdentifier: bareIdentifier } = splitProviderPrefix(trimmed);
    return getSpeechModelById(bareIdentifier, provider ?? undefined)?.modelKey ?? null;
}

export function getPreferredSpeechModelKey(provider: SpeechProvider, profile: SpeechModelProfile): string | null {
    return SPEECH_PROVIDER_MODEL_PROFILES[provider][profile];
}

export function getPreferredSpeechModel(provider: SpeechProvider, profile: SpeechModelProfile): SpeechModelCatalogEntry | null {
    const modelKey = getPreferredSpeechModelKey(provider, profile);
    if (!modelKey) return null;
    return getSpeechModelByKey(modelKey);
}

export function getPreferredSpeechModelId(params: { provider?: SpeechProvider; profile: SpeechModelProfile }): string | null {
    return getPreferredSpeechModel(params.provider ?? DEFAULT_SPEECH_PROVIDER, params.profile)?.modelId ?? null;
}

export function getSpeechModelProfileCostPolicy(provider: SpeechProvider, profile: SpeechModelProfile): SpeechModelProfileCostPolicy {
    return SPEECH_PROVIDER_MODEL_PROFILE_COST_POLICIES[provider][profile];
}

export function evaluateSpeechModelProfileCostPolicy(params: {
    provider: SpeechProvider;
    profile: SpeechModelProfile;
    candidateModelKey?: string | null;
}): SpeechModelProfileCostPolicyEvaluation {
    const policy = getSpeechModelProfileCostPolicy(params.provider, params.profile);
    const defaultModelKey = getPreferredSpeechModelKey(params.provider, params.profile);
    const modelKey = hasOwnProperty(params, 'candidateModelKey') ? (params.candidateModelKey ?? null) : defaultModelKey;
    const violations: string[] = [];
    const model = modelKey ? getSpeechModelByKey(modelKey) : null;

    if (!modelKey) {
        violations.push(`${params.provider} ${params.profile} has no configured speech model default.`);
    } else if (!model) {
        violations.push(`${modelKey} is not in the shared speech model catalog.`);
    } else {
        if (model.provider !== params.provider) {
            violations.push(`${modelKey} belongs to provider ${model.provider}, not ${params.provider}.`);
        }

        if (OUTDATED_SPEECH_MODEL_STATUSES.has(model.status)) {
            violations.push(`${modelKey} is ${model.status} and cannot be a profile default.`);
        }

        if (policy.maxCharacterCostMultiplier !== null) {
            if (model.pricing.characterCostMultiplier === null) {
                violations.push(`${modelKey} is missing character pricing required by the profile cost policy.`);
            } else if (model.pricing.characterCostMultiplier > policy.maxCharacterCostMultiplier) {
                violations.push(
                    `${modelKey} character cost multiplier ${model.pricing.characterCostMultiplier} exceeds profile limit ${policy.maxCharacterCostMultiplier}.`
                );
            }
        }
    }

    return {
        provider: params.provider,
        profile: params.profile,
        modelKey,
        characterCostMultiplier: model?.pricing.characterCostMultiplier ?? null,
        maxCharacterCostMultiplier: policy.maxCharacterCostMultiplier,
        isWithinPolicy: violations.length === 0,
        violations
    };
}

export function listSpeechModelProfileCostPolicyEvaluations(): SpeechModelProfileCostPolicyEvaluation[] {
    const evaluations: SpeechModelProfileCostPolicyEvaluation[] = [];

    for (const provider of SPEECH_PROVIDERS) {
        const profiles = Object.keys(SPEECH_PROVIDER_MODEL_PROFILES[provider]) as SpeechModelProfile[];
        for (const profile of profiles) {
            evaluations.push(evaluateSpeechModelProfileCostPolicy({ provider, profile }));
        }
    }

    return evaluations;
}

export function listSpeechModelProfileCostPolicyViolations(): SpeechModelProfileCostPolicyEvaluation[] {
    return listSpeechModelProfileCostPolicyEvaluations().filter((evaluation) => !evaluation.isWithinPolicy);
}

/**
 * Resolves the speech model an app should send to its provider.
 *
 * An explicit `model` (typically an env override) wins over the profile default. Deprecated and retired catalog
 * models are upgraded to their recommended replacement with a warning; legacy models are honored with a warning;
 * identifiers outside the catalog are passed through unchanged with a warning so custom or fine-tuned models keep
 * working.
 */
export function resolveSpeechModelConfig(params: {
    provider?: SpeechProvider;
    profile: SpeechModelProfile;
    model?: string | null;
}): SpeechResolvedModelConfig {
    const warnings: string[] = [];
    const overridesApplied: string[] = [];
    const requestedModel = normalizeNonEmptyString(params.model);
    const provider = params.provider ?? (requestedModel ? inferSpeechProviderFromModel(requestedModel) : null) ?? DEFAULT_SPEECH_PROVIDER;

    if (requestedModel) {
        overridesApplied.push('model');

        const { provider: prefixedProvider, modelIdentifier } = splitProviderPrefix(requestedModel);
        if (prefixedProvider && prefixedProvider !== provider) {
            warnings.push(
                `Speech model "${requestedModel}" names provider ${prefixedProvider}, but ${provider} was requested; using ${provider}.`
            );
        }

        const catalogEntry = getSpeechModelById(modelIdentifier, provider);
        if (!catalogEntry) {
            warnings.push(
                `Speech model "${requestedModel}" is not in the shared ${provider} catalog; sending it to the provider as provided.`
            );
            return buildResolvedConfig({
                provider,
                profile: params.profile,
                requestedModel,
                modelKey: null,
                modelId: modelIdentifier,
                catalogEntry: null,
                warnings,
                overridesApplied
            });
        }

        if (OUTDATED_SPEECH_MODEL_STATUSES.has(catalogEntry.status)) {
            const replacement = catalogEntry.recommendedReplacementModelKey
                ? getSpeechModelByKey(catalogEntry.recommendedReplacementModelKey)
                : null;

            if (replacement) {
                warnings.push(
                    `Speech model "${catalogEntry.modelKey}" is ${catalogEntry.status} and was automatically upgraded to "${replacement.modelKey}".`
                );
                return buildResolvedConfig({
                    provider,
                    profile: params.profile,
                    requestedModel,
                    modelKey: replacement.modelKey,
                    modelId: replacement.modelId,
                    catalogEntry: replacement,
                    warnings,
                    overridesApplied
                });
            }

            warnings.push(`Speech model "${catalogEntry.modelKey}" is ${catalogEntry.status} and has no recommended replacement.`);
        } else if (catalogEntry.status === 'legacy') {
            const replacementHint = catalogEntry.recommendedReplacementModelKey
                ? ` Consider "${catalogEntry.recommendedReplacementModelKey}".`
                : '';
            warnings.push(`Speech model "${catalogEntry.modelKey}" is a legacy model.${replacementHint}`);
        }

        return buildResolvedConfig({
            provider,
            profile: params.profile,
            requestedModel,
            modelKey: catalogEntry.modelKey,
            modelId: catalogEntry.modelId,
            catalogEntry,
            warnings,
            overridesApplied
        });
    }

    const preferredModel = getPreferredSpeechModel(provider, params.profile);
    if (!preferredModel) {
        throw new Error(`No default ${provider} speech model is configured for the "${params.profile}" profile.`);
    }

    return buildResolvedConfig({
        provider,
        profile: params.profile,
        requestedModel: null,
        modelKey: preferredModel.modelKey,
        modelId: preferredModel.modelId,
        catalogEntry: preferredModel,
        warnings,
        overridesApplied
    });
}

export function resolveSpeechModelId(params: { provider?: SpeechProvider; profile: SpeechModelProfile; model?: string | null }): string {
    return resolveSpeechModelConfig(params).modelId;
}
