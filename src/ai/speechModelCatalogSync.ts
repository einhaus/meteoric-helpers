import process from 'node:process';
import { SPEECH_MODEL_CATALOG } from './speechModelCatalog.js';
import type { AiModelStatus } from './aiModelTypes.js';
import type { SpeechModelCatalogEntry, SpeechProvider } from './speechModelTypes.js';

const DEFAULT_ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

export type DiscoveredSpeechModel = Readonly<{
    modelId: string;
    displayName: string | null;
    characterCostMultiplier: number | null;
    maxCharactersPerRequest: number | null;
    languageCount: number | null;
}>;

export type SpeechCatalogMetadataField = 'characterCostMultiplier' | 'maxCharactersPerRequest' | 'languageCount';

export type SpeechCatalogMetadataMismatch = Readonly<{
    modelId: string;
    field: SpeechCatalogMetadataField;
    catalogValue: number | null;
    providerValue: number | null;
}>;

export type SpeechCatalogAuditProviderResult = Readonly<{
    provider: SpeechProvider;
    skipped: boolean;
    reason: string | null;
    discoveredModels: readonly DiscoveredSpeechModel[];
    catalogKnownModelIds: readonly string[];
    missingFromCatalog: readonly string[];
    missingFromProvider: readonly string[];
    metadataMismatches: readonly SpeechCatalogMetadataMismatch[];
}>;

export type SpeechCatalogAuditResult = Readonly<{
    generatedAt: string;
    providers: readonly SpeechCatalogAuditProviderResult[];
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const readFiniteNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const readNonEmptyString = (value: unknown): string | null => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized ? normalized : null;
};

function getKnownCatalogModels(provider: SpeechProvider, includeLegacyCatalogEntries: boolean): SpeechModelCatalogEntry[] {
    const statusesToInclude = includeLegacyCatalogEntries
        ? new Set<AiModelStatus>(['active', 'specialized', 'legacy', 'deprecated', 'retired'])
        : new Set<AiModelStatus>(['active', 'specialized']);

    return SPEECH_MODEL_CATALOG.filter((model) => model.provider === provider && statusesToInclude.has(model.status));
}

function getKnownCatalogModelIds(provider: SpeechProvider, includeLegacyCatalogEntries: boolean): string[] {
    const knownIds = new Set<string>();

    for (const model of getKnownCatalogModels(provider, includeLegacyCatalogEntries)) {
        knownIds.add(model.modelId);
        for (const alias of model.aliases) {
            knownIds.add(alias);
        }
    }

    return Array.from(knownIds).sort();
}

export function getSpeechCatalogAuditConfigFromEnv(env: NodeJS.ProcessEnv = process.env): { elevenLabsApiKey: string | null } {
    return {
        elevenLabsApiKey: env.ELEVENLABS_API_KEY?.trim() || null
    };
}

/** Lists the text-to-speech models the ElevenLabs account can use, with the metadata the catalog tracks. */
export async function discoverElevenLabsModels(
    apiKey: string,
    baseUrl: string = DEFAULT_ELEVENLABS_BASE_URL
): Promise<DiscoveredSpeechModel[]> {
    const response = await fetch(`${baseUrl}/models`, {
        headers: {
            'xi-api-key': apiKey,
            accept: 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`ElevenLabs models.list failed (${response.status}): ${errorText || response.statusText}`);
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
        throw new Error('ElevenLabs models.list returned an unexpected payload (expected an array).');
    }

    const discoveredModels: DiscoveredSpeechModel[] = [];

    for (const entry of body) {
        if (!isRecord(entry)) continue;

        const modelId = readNonEmptyString(entry.model_id);
        if (!modelId || entry.can_do_text_to_speech !== true) continue;

        const modelRates = isRecord(entry.model_rates) ? entry.model_rates : null;
        const languages = Array.isArray(entry.languages) ? entry.languages : null;

        discoveredModels.push({
            modelId,
            displayName: readNonEmptyString(entry.name),
            characterCostMultiplier: modelRates ? readFiniteNumber(modelRates.character_cost_multiplier) : null,
            maxCharactersPerRequest: readFiniteNumber(entry.max_characters_request_subscribed_user),
            languageCount: languages ? languages.length : null
        });
    }

    return discoveredModels.sort((a, b) => a.modelId.localeCompare(b.modelId));
}

function collectMetadataMismatches(
    knownModels: readonly SpeechModelCatalogEntry[],
    discoveredModels: readonly DiscoveredSpeechModel[]
): SpeechCatalogMetadataMismatch[] {
    const discoveredById = new Map(discoveredModels.map((model) => [model.modelId, model]));
    const mismatches: SpeechCatalogMetadataMismatch[] = [];

    for (const model of knownModels) {
        const discovered = discoveredById.get(model.modelId);
        if (!discovered) continue;

        const comparisons: ReadonlyArray<{ field: SpeechCatalogMetadataField; catalogValue: number | null; providerValue: number | null }> =
            [
                {
                    field: 'characterCostMultiplier',
                    catalogValue: model.pricing.characterCostMultiplier,
                    providerValue: discovered.characterCostMultiplier
                },
                {
                    field: 'maxCharactersPerRequest',
                    catalogValue: model.maxCharactersPerRequest,
                    providerValue: discovered.maxCharactersPerRequest
                },
                { field: 'languageCount', catalogValue: model.languageCount, providerValue: discovered.languageCount }
            ];

        for (const comparison of comparisons) {
            if (comparison.providerValue === null || comparison.catalogValue === comparison.providerValue) continue;
            mismatches.push({ modelId: model.modelId, ...comparison });
        }
    }

    return mismatches;
}

export function auditProviderSpeechModels(params: {
    provider: SpeechProvider;
    discoveredModels: readonly DiscoveredSpeechModel[];
    includeLegacyCatalogEntries?: boolean;
}): SpeechCatalogAuditProviderResult {
    const includeLegacyCatalogEntries = params.includeLegacyCatalogEntries ?? false;
    const knownModels = getKnownCatalogModels(params.provider, includeLegacyCatalogEntries);
    const catalogKnownModelIds = getKnownCatalogModelIds(params.provider, includeLegacyCatalogEntries);
    const catalogKnownModelIdSet = new Set(catalogKnownModelIds);
    const discoveredModelIds = params.discoveredModels.map((model) => model.modelId).sort();
    const discoveredModelIdSet = new Set(discoveredModelIds);

    return {
        provider: params.provider,
        skipped: false,
        reason: null,
        discoveredModels: params.discoveredModels,
        catalogKnownModelIds,
        missingFromCatalog: discoveredModelIds.filter((modelId) => !catalogKnownModelIdSet.has(modelId)),
        missingFromProvider: catalogKnownModelIds.filter((modelId) => !discoveredModelIdSet.has(modelId)),
        metadataMismatches: collectMetadataMismatches(knownModels, params.discoveredModels)
    };
}

export async function auditSpeechModelCatalog(params?: {
    elevenLabsApiKey?: string | null;
    elevenLabsBaseUrl?: string;
    includeLegacyCatalogEntries?: boolean;
}): Promise<SpeechCatalogAuditResult> {
    const includeLegacyCatalogEntries = params?.includeLegacyCatalogEntries ?? false;
    const results: SpeechCatalogAuditProviderResult[] = [];

    if (!params?.elevenLabsApiKey) {
        results.push({
            provider: 'elevenlabs',
            skipped: true,
            reason: 'ELEVENLABS_API_KEY not provided',
            discoveredModels: [],
            catalogKnownModelIds: getKnownCatalogModelIds('elevenlabs', includeLegacyCatalogEntries),
            missingFromCatalog: [],
            missingFromProvider: [],
            metadataMismatches: []
        });
    } else {
        const discoveredModels = await discoverElevenLabsModels(params.elevenLabsApiKey, params.elevenLabsBaseUrl);
        results.push(
            auditProviderSpeechModels({
                provider: 'elevenlabs',
                discoveredModels,
                includeLegacyCatalogEntries
            })
        );
    }

    return {
        generatedAt: new Date().toISOString(),
        providers: results
    };
}

export function buildSpeechCatalogAuditSummary(result: SpeechCatalogAuditResult): string {
    return result.providers
        .map((providerResult) => {
            if (providerResult.skipped) {
                return `${providerResult.provider}: skipped (${providerResult.reason ?? 'no reason provided'})`;
            }

            return `${providerResult.provider}: discovered=${providerResult.discoveredModels.length}, missingFromCatalog=${providerResult.missingFromCatalog.length}, missingFromProvider=${providerResult.missingFromProvider.length}, metadataMismatches=${providerResult.metadataMismatches.length}`;
        })
        .join('\n');
}

export function listSpeechCatalogModelsForProvider(provider: SpeechProvider): readonly SpeechModelCatalogEntry[] {
    return SPEECH_MODEL_CATALOG.filter((model) => model.provider === provider);
}
