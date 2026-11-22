import { AI_MODEL_CATALOG } from './aiModelCatalog.js';
import { resolveCurrentAiCatalogModel } from './aiModelSelectors.js';
import type { AiCatalogProvider, AiModelCatalogEntry, AiProvider } from './aiModelTypes.js';

export function listCatalogModelsForProvider<Provider extends AiProvider>(provider: Provider): readonly AiModelCatalogEntry<Provider>[];
export function listCatalogModelsForProvider(provider: AiCatalogProvider): readonly AiModelCatalogEntry<AiCatalogProvider>[];
export function listCatalogModelsForProvider(provider: AiCatalogProvider): readonly AiModelCatalogEntry<AiCatalogProvider>[] {
    return AI_MODEL_CATALOG.filter((model) => model.provider === provider);
}

export function getAiCatalogModelByKey(modelKey: string): AiModelCatalogEntry<AiCatalogProvider> | null {
    const key = modelKey.trim();
    return AI_MODEL_CATALOG.find((model) => model.modelKey === key) ?? null;
}

/** Validate every provider's identifiers and same-provider replacement paths. Throws with the failing model's context. */
export function validateAiModelCatalog(catalog: readonly AiModelCatalogEntry<AiCatalogProvider>[] = AI_MODEL_CATALOG): void {
    const modelsByKey = new Map<string, AiModelCatalogEntry<AiCatalogProvider>>();
    for (const model of catalog) {
        if (!model.modelKey.startsWith(`${model.provider}:`) || !model.modelKey.split(':')[1]?.trim() || !model.modelId.trim()) {
            throw new Error(`Catalog model "${model.modelKey}" has an invalid provider prefix or empty model ID.`);
        }
        if (modelsByKey.has(model.modelKey)) {
            throw new Error(`Duplicate catalog model key "${model.modelKey}".`);
        }
        modelsByKey.set(model.modelKey, model);
    }
    for (const model of catalog) {
        resolveCurrentAiCatalogModel(model, (key) => modelsByKey.get(key) ?? null);
    }
}
