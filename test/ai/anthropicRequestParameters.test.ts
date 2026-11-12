import { describe, expect, it } from 'vitest';
import { buildAnthropicTextRequestParameters } from '../../src/ai/anthropicRequestParameters.js';
import { resolveAiRequestConfig } from '../../src/ai/aiRequestSelectors.js';
import { evaluateAiModelProfileCostPolicy, getAiModelById } from '../../src/ai/aiModelSelectors.js';

describe('premium creative writing requests', () => {
    it('selects Opus with medium effort and compatible adaptive thinking settings', () => {
        const config = resolveAiRequestConfig({ preset: 'creativeWritingPremium', maxOutputTokens: 8_000, temperature: 0.8 });
        expect(config.modelProfile).toBe('creativeWritingPremium');
        expect(buildAnthropicTextRequestParameters(config)).toEqual({
            model: 'claude-opus-5-5',
            max_tokens: 8_000,
            output_config: { effort: 'medium' },
            thinking: { type: 'adaptive' }
        });
        expect(evaluateAiModelProfileCostPolicy({ provider: 'anthropic', profile: 'creativeWritingPremium' }).isWithinPolicy).toBe(true);
        expect(
            evaluateAiModelProfileCostPolicy({
                provider: 'anthropic',
                profile: 'creativeWritingPremium',
                candidateModelKey: 'anthropic:claude-fable-5-1'
            }).isWithinPolicy
        ).toBe(false);
    });

    it('keeps the general reasoning and balanced writing selections independent', () => {
        expect(resolveAiRequestConfig({ preset: 'agentChat', provider: 'anthropic' }).reasoningEffort).toBe('high');
        expect(resolveAiRequestConfig({ preset: 'creativeWriting', provider: 'anthropic' }).modelId).toBe('claude-sonnet-5-5');
    });

    it('uses validated effort overrides and clamps output to the selected model limit', () => {
        const config = resolveAiRequestConfig({ preset: 'creativeWritingPremium', reasoningEffort: 'low', maxOutputTokens: 1_000_000 });
        expect(buildAnthropicTextRequestParameters(config)).toMatchObject({
            max_tokens: 128_000,
            output_config: { effort: 'low' }
        });
        const invalidEffort = resolveAiRequestConfig({ preset: 'creativeWritingPremium', reasoningEffort: 'none' });
        expect(buildAnthropicTextRequestParameters(invalidEffort)).not.toHaveProperty('output_config');
    });

    it('rejects a configuration for the wrong provider or an invalid output limit', () => {
        expect(() => buildAnthropicTextRequestParameters(resolveAiRequestConfig({ preset: 'creativeWriting' }))).toThrow(
            'Expected an Anthropic'
        );
        expect(() =>
            buildAnthropicTextRequestParameters(resolveAiRequestConfig({ preset: 'creativeWritingPremium', maxOutputTokens: 0 }))
        ).toThrow('positive integer');
    });

    it('uses manual budgets only for models that support them and rejects budgets exceeding output limits', () => {
        // Historical request fixture exercises the adapter without changing automatic model upgrades.
        const config = {
            ...resolveAiRequestConfig({ preset: 'creativeWritingPremium' }),
            modelId: 'claude-opus-4-5',
            catalogEntry: getAiModelById('claude-opus-4-5'),
            reasoningEffort: null,
            anthropicThinkingBudgetTokens: 2_048
        };
        expect(buildAnthropicTextRequestParameters(config)).toMatchObject({ thinking: { type: 'enabled', budget_tokens: 2_048 } });
        expect(buildAnthropicTextRequestParameters(config)).not.toHaveProperty('output_config');
        expect(() => buildAnthropicTextRequestParameters({ ...config, maxOutputTokens: 1_024 })).toThrow('below max output tokens');
    });
});
