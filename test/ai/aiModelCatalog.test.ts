import { describe, expect, it } from 'vitest';
import {
    estimateAiModelCostUsd,
    getAiModelById,
    getPreferredAiModelId,
    inferAiProviderFromModel,
    listAiModels,
    normalizeAiModelKey
} from '../../src/ai/aiModelSelectors.js';

describe('AI model catalog helpers', () => {
    it('normalizes provider-prefixed and raw model identifiers into shared model keys', () => {
        expect(normalizeAiModelKey('openai:gpt-5.4')).toBe('openai:gpt-5.4');
        expect(normalizeAiModelKey('claude-sonnet-4-6')).toBe('anthropic:claude-sonnet-4-6');
        expect(normalizeAiModelKey('gpt-5.4-mini')).toBe('openai:gpt-5.4-mini');
    });

    it('resolves preferred model ids and uses snapshot ids when requested', () => {
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'reasoning' })).toBe('gpt-5.4');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'fast', preferSnapshot: true })).toBe(
            'claude-haiku-4-5-20251001'
        );
    });

    it('filters legacy models unless explicitly requested', () => {
        const defaultOpenAiModels = listAiModels({ provider: 'openai' });
        expect(defaultOpenAiModels.some((model) => model.modelKey === 'openai:gpt-5')).toBe(false);

        const openAiModelsWithLegacy = listAiModels({ provider: 'openai', includeLegacy: true });
        expect(openAiModelsWithLegacy.some((model) => model.modelKey === 'openai:gpt-5')).toBe(true);
    });

    it('estimates model cost using curated pricing metadata', () => {
        const estimate = estimateAiModelCostUsd({
            model: 'openai:gpt-5.4',
            inputTokens: 1_000,
            outputTokens: 100
        });

        expect(estimate).not.toBeNull();
        expect(estimate?.totalCostUsd).toBe(0.004);
    });

    it('applies long-context pricing when the configured threshold is exceeded', () => {
        const estimate = estimateAiModelCostUsd({
            model: 'gpt-5.4',
            inputTokens: 300_000,
            outputTokens: 100_000
        });

        expect(estimate).not.toBeNull();
        expect(estimate?.longContextApplied).toBe(true);
        expect(estimate?.totalCostUsd).toBe(3.75);
    });

    it('can still resolve legacy models used by current apps', () => {
        expect(getAiModelById('gpt-4o-mini')?.modelKey).toBe('openai:gpt-4o-mini');
        expect(getAiModelById('claude-3-5-haiku-20241022')?.modelKey).toBe('anthropic:claude-3-5-haiku-20241022');
        expect(inferAiProviderFromModel('claude-sonnet-4-6')).toBe('anthropic');
    });
});
