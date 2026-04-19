import process from 'node:process';
import { AI_MODEL_CATALOG } from './aiModelCatalog.js';
import type { AiModelCatalogEntry, AiModelStatus, AiProvider } from './aiModelTypes.js';

export type DiscoveredProviderModel = Readonly<{
    modelId: string;
    displayName: string | null;
}>;

export type AiCatalogAuditProviderResult = Readonly<{
    provider: AiProvider;
    skipped: boolean;
    reason: string | null;
    discoveredModels: readonly DiscoveredProviderModel[];
    catalogKnownModelIds: readonly string[];
    missingFromCatalog: readonly string[];
    missingFromProvider: readonly string[];
}>;

export type AiCatalogAuditResult = Readonly<{
    generatedAt: string;
    providers: readonly AiCatalogAuditProviderResult[];
}>;

function getKnownCatalogModelIds(provider: AiProvider, includeLegacyCatalogEntries: boolean): string[] {
    const statusesToInclude = includeLegacyCatalogEntries
        ? new Set<AiModelStatus>(['active', 'specialized', 'legacy', 'deprecated', 'retired'])
        : new Set<AiModelStatus>(['active', 'specialized']);

    const knownIds = new Set<string>();

    for (const model of AI_MODEL_CATALOG) {
        if (model.provider !== provider || !statusesToInclude.has(model.status)) continue;

        knownIds.add(model.modelId);
        if (model.snapshotModelId) knownIds.add(model.snapshotModelId);

        for (const alias of model.aliases) {
            knownIds.add(alias);
        }
    }

    return Array.from(knownIds).sort();
}

export function getAiCatalogAuditConfigFromEnv(env: NodeJS.ProcessEnv = process.env): {
    openAiApiKey: string | null;
    anthropicApiKey: string | null;
} {
    const openAiApiKey = env.OPENAI_API_KEY?.trim() || env.OPEN_API_KEY?.trim() || null;
    const anthropicApiKey = env.ANTHROPIC_API_KEY?.trim() || null;

    return {
        openAiApiKey,
        anthropicApiKey
    };
}

export async function discoverOpenAiModels(apiKey: string): Promise<DiscoveredProviderModel[]> {
    const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`OpenAI models.list failed (${response.status}): ${errorText || response.statusText}`);
    }

    const body = (await response.json()) as {
        data?: Array<{
            id?: string;
        }>;
    };

    const discoveredModels: DiscoveredProviderModel[] = [];

    for (const model of body.data ?? []) {
        const modelId = model.id?.trim() ?? '';
        if (!modelId) continue;

        discoveredModels.push({
            modelId,
            displayName: null
        });
    }

    return discoveredModels.sort((a, b) => a.modelId.localeCompare(b.modelId));
}

export async function discoverAnthropicModels(apiKey: string): Promise<DiscoveredProviderModel[]> {
    const discoveredModels: DiscoveredProviderModel[] = [];
    let afterId: string | null = null;

    while (true) {
        const url = new URL('https://api.anthropic.com/v1/models');
        if (afterId) url.searchParams.set('after_id', afterId);

        const response = await fetch(url, {
            headers: {
                'anthropic-version': '2023-06-01',
                'x-api-key': apiKey
            }
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Anthropic models.list failed (${response.status}): ${errorText || response.statusText}`);
        }

        const body = (await response.json()) as {
            data?: Array<{
                id?: string;
                display_name?: string | null;
            }>;
            has_more?: boolean;
            last_id?: string | null;
        };

        const models: DiscoveredProviderModel[] = [];

        for (const model of body.data ?? []) {
            const modelId = model.id?.trim() ?? '';
            if (!modelId) continue;

            models.push({
                modelId,
                displayName: model.display_name?.trim() || null
            });
        }

        discoveredModels.push(...models);

        if (!body.has_more || !body.last_id) break;
        afterId = body.last_id;
    }

    return discoveredModels.sort((a, b) => a.modelId.localeCompare(b.modelId));
}

export function auditProviderModels(params: {
    provider: AiProvider;
    discoveredModels: readonly DiscoveredProviderModel[];
    includeLegacyCatalogEntries?: boolean;
}): AiCatalogAuditProviderResult {
    const includeLegacyCatalogEntries = params.includeLegacyCatalogEntries ?? false;
    const catalogKnownModelIds = getKnownCatalogModelIds(params.provider, includeLegacyCatalogEntries);
    const catalogKnownModelIdSet = new Set(catalogKnownModelIds);
    const discoveredModelIds = params.discoveredModels.map((model) => model.modelId).sort();
    const discoveredModelIdSet = new Set(discoveredModelIds);

    const missingFromCatalog = discoveredModelIds.filter((modelId) => !catalogKnownModelIdSet.has(modelId));
    const missingFromProvider = catalogKnownModelIds.filter((modelId) => !discoveredModelIdSet.has(modelId));

    return {
        provider: params.provider,
        skipped: false,
        reason: null,
        discoveredModels: params.discoveredModels,
        catalogKnownModelIds,
        missingFromCatalog,
        missingFromProvider
    };
}

export async function auditAiModelCatalog(params?: {
    openAiApiKey?: string | null;
    anthropicApiKey?: string | null;
    includeLegacyCatalogEntries?: boolean;
}): Promise<AiCatalogAuditResult> {
    const includeLegacyCatalogEntries = params?.includeLegacyCatalogEntries ?? false;
    const results: AiCatalogAuditProviderResult[] = [];

    if (!params?.openAiApiKey) {
        results.push({
            provider: 'openai',
            skipped: true,
            reason: 'OPENAI_API_KEY not provided',
            discoveredModels: [],
            catalogKnownModelIds: getKnownCatalogModelIds('openai', includeLegacyCatalogEntries),
            missingFromCatalog: [],
            missingFromProvider: []
        });
    } else {
        const discoveredModels = await discoverOpenAiModels(params.openAiApiKey);
        results.push(
            auditProviderModels({
                provider: 'openai',
                discoveredModels,
                includeLegacyCatalogEntries
            })
        );
    }

    if (!params?.anthropicApiKey) {
        results.push({
            provider: 'anthropic',
            skipped: true,
            reason: 'ANTHROPIC_API_KEY not provided',
            discoveredModels: [],
            catalogKnownModelIds: getKnownCatalogModelIds('anthropic', includeLegacyCatalogEntries),
            missingFromCatalog: [],
            missingFromProvider: []
        });
    } else {
        const discoveredModels = await discoverAnthropicModels(params.anthropicApiKey);
        results.push(
            auditProviderModels({
                provider: 'anthropic',
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

export function buildAiCatalogAuditSummary(result: AiCatalogAuditResult): string {
    return result.providers
        .map((providerResult) => {
            if (providerResult.skipped) {
                return `${providerResult.provider}: skipped (${providerResult.reason ?? 'no reason provided'})`;
            }

            return `${providerResult.provider}: discovered=${providerResult.discoveredModels.length}, missingFromCatalog=${providerResult.missingFromCatalog.length}, missingFromProvider=${providerResult.missingFromProvider.length}`;
        })
        .join('\n');
}

export function listCatalogModelsForProvider(provider: AiProvider): readonly AiModelCatalogEntry[] {
    return AI_MODEL_CATALOG.filter((model) => model.provider === provider);
}
