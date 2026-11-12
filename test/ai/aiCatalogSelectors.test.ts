import { describe, expect, it } from 'vitest';
import { getAiCatalogModelByKey, listCatalogModelsForProvider, validateAiModelCatalog } from '../../src/ai/aiCatalogSelectors.js';
import { getAiModelCatalog } from '../../src/ai/aiModelSelectors.js';
import { listCatalogModelsForProvider as listNodeCatalogModels } from '../../src/ai/aiModelCatalogSync.js';
import type { AiCatalogProvider, AiModelCatalogEntry } from '../../src/ai/aiModelTypes.js';

describe('common provider catalogs', () => {
    it('includes Google in shared listing and validation without changing existing text routing', () => {
        expect(listCatalogModelsForProvider('google').some((model) => model.modelId === 'gemini-4-hydrogen')).toBe(true);
        expect(listNodeCatalogModels('google')).toEqual(listCatalogModelsForProvider('google'));
        expect(listCatalogModelsForProvider('anthropic')).toEqual(getAiModelCatalog().filter((model) => model.provider === 'anthropic'));
        expect(getAiModelCatalog().every((model) => model.provider === 'openai' || model.provider === 'anthropic')).toBe(true);
        expect(() => validateAiModelCatalog()).not.toThrow();
    });

    it.each(['missing', 'cycle', 'cross-provider', 'duplicate'] as const)('rejects a %s replacement graph', (failure) => {
        const model = getAiCatalogModelByKey('google:gemini-2.5-flash');
        if (!model) throw new Error('Missing Gemini fixture.');
        const outdated: AiModelCatalogEntry<AiCatalogProvider> = {
            ...model,
            recommendedReplacementModelKey: failure === 'cycle' ? model.modelKey : 'anthropic:replacement'
        };
        const replacement: AiModelCatalogEntry<AiCatalogProvider> = {
            ...model,
            provider: 'anthropic',
            modelKey: 'anthropic:replacement',
            modelId: 'replacement',
            status: 'active',
            recommendedReplacementModelKey: null
        };
        const catalog = failure === 'cross-provider' ? [outdated, replacement] : failure === 'duplicate' ? [model, model] : [outdated];
        expect(() => validateAiModelCatalog(catalog)).toThrow(
            failure === 'missing' ? 'missing catalog model' : failure === 'duplicate' ? 'Duplicate' : failure
        );
    });
});
