import { describe, expect, it } from 'vitest';
import {
    aiModelSupportsVision,
    estimateAiModelCostUsd,
    evaluateAiModelProfileCostPolicy,
    getAiModelById,
    getPreferredAiModelId,
    getPreferredAiModelInferenceProfileKey,
    getPreferredAiModelProfileConfig,
    inferAiProviderFromModel,
    isAiAgentChatCandidate,
    listAiModelProfileCostPolicyViolations,
    listAiModels,
    normalizeAiModelKey
} from '../../src/ai/aiModelSelectors.js';

describe('AI model catalog helpers', () => {
    it('normalizes provider-prefixed and raw model identifiers into shared model keys', () => {
        expect(normalizeAiModelKey('openai:gpt-5.5')).toBe('openai:gpt-5.5');
        expect(normalizeAiModelKey('claude-sonnet-4-6')).toBe('anthropic:claude-sonnet-4-6');
        expect(normalizeAiModelKey('gpt-5.4-mini')).toBe('openai:gpt-5.4-mini');
    });

    it('resolves preferred model ids and uses snapshot ids when requested', () => {
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'reasoning' })).toBe('gpt-5.4');
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'balanced' })).toBe('gpt-5.4');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'reasoning' })).toBe('claude-opus-4-8');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'fast', preferSnapshot: true })).toBe('claude-haiku-4-5-20251001');
    });

    it('resolves preferred model profiles as model and inference-profile combinations', () => {
        const openAiReasoningProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'reasoning' });
        const openAiBalancedProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'balanced' });
        const anthropicReasoningProfile = getPreferredAiModelProfileConfig({ provider: 'anthropic', profile: 'reasoning' });

        expect(openAiReasoningProfile?.modelKey).toBe('openai:gpt-5.4');
        expect(openAiReasoningProfile?.inferenceProfileKey).toBe('reasoning_high');
        expect(openAiReasoningProfile?.model?.modelId).toBe('gpt-5.4');
        expect(openAiBalancedProfile?.modelKey).toBe('openai:gpt-5.4');
        expect(openAiBalancedProfile?.inferenceProfileKey).toBe('reasoning_medium');
        expect(anthropicReasoningProfile?.modelKey).toBe('anthropic:claude-opus-4-8');
        expect(anthropicReasoningProfile?.model?.modelId).toBe('claude-opus-4-8');
        expect(getPreferredAiModelInferenceProfileKey('anthropic', 'reasoning')).toBe('reasoning_high');
    });

    it('keeps preferred profile defaults inside explicit cost-policy budgets', () => {
        expect(listAiModelProfileCostPolicyViolations()).toEqual([]);

        const compatibleOpusUpgrade = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'reasoning',
            candidateModelKey: 'anthropic:claude-opus-4-8'
        });

        expect(compatibleOpusUpgrade.isWithinPolicy).toBe(true);

        const unapprovedFablePromotion = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'reasoning',
            candidateModelKey: 'anthropic:claude-fable-5'
        });

        expect(unapprovedFablePromotion.isWithinPolicy).toBe(false);
        expect(unapprovedFablePromotion.inputPriceMultiplier).toBe(2);
        expect(unapprovedFablePromotion.outputPriceMultiplier).toBe(2);
        expect(unapprovedFablePromotion.violations).toEqual(
            expect.arrayContaining([
                expect.stringContaining('input price 10 exceeds profile budget 5'),
                expect.stringContaining('output price 50 exceeds profile budget 25')
            ])
        );

        const unapprovedGpt55Promotion = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'balanced',
            candidateModelKey: 'openai:gpt-5.5'
        });

        expect(unapprovedGpt55Promotion.isWithinPolicy).toBe(false);
        expect(unapprovedGpt55Promotion.inputPriceMultiplier).toBe(2);
        expect(unapprovedGpt55Promotion.outputPriceMultiplier).toBe(2);
        expect(unapprovedGpt55Promotion.violations).toEqual(
            expect.arrayContaining([
                expect.stringContaining('input price 5 exceeds profile budget 2.5'),
                expect.stringContaining('output price 30 exceeds profile budget 15')
            ])
        );
    });

    it('filters legacy models unless explicitly requested', () => {
        const defaultOpenAiModels = listAiModels({ provider: 'openai' });
        expect(defaultOpenAiModels.some((model) => model.modelKey === 'openai:gpt-5')).toBe(false);

        const openAiModelsWithLegacy = listAiModels({ provider: 'openai', includeLegacy: true });
        expect(openAiModelsWithLegacy.some((model) => model.modelKey === 'openai:gpt-5')).toBe(true);

        const defaultAnthropicModels = listAiModels({ provider: 'anthropic' });
        expect(defaultAnthropicModels.some((model) => model.modelKey === 'anthropic:claude-3-7-sonnet-20250219')).toBe(false);
    });

    it('estimates model cost using curated pricing metadata', () => {
        const estimate = estimateAiModelCostUsd({
            model: 'openai:gpt-5.5',
            inputTokens: 1_000,
            outputTokens: 100
        });

        expect(estimate).not.toBeNull();
        expect(estimate?.totalCostUsd).toBe(0.008);
    });

    it('applies long-context pricing when the configured threshold is exceeded', () => {
        const estimate = estimateAiModelCostUsd({
            model: 'gpt-5.5',
            inputTokens: 300_000,
            outputTokens: 100_000
        });

        expect(estimate).not.toBeNull();
        expect(estimate?.longContextApplied).toBe(true);
        expect(estimate?.totalCostUsd).toBe(7.5);
    });

    it('can still resolve legacy models used by current apps', () => {
        expect(getAiModelById('gpt-4o-mini')?.modelKey).toBe('openai:gpt-4o-mini');
        expect(getAiModelById('chatgpt-4o-latest')?.modelKey).toBe('openai:chatgpt-4o-latest');
        expect(getAiModelById('chat-latest')?.modelKey).toBe('openai:chat-latest');
        expect(getAiModelById('chat-latest')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('gpt-5.3-chat-latest')?.status).toBe('deprecated');
        expect(getAiModelById('gpt-5-chat-latest')?.recommendedReplacementModelKey).toBe('openai:gpt-5.5');
        expect(getAiModelById('gpt-5.5-pro')?.modelKey).toBe('openai:gpt-5.5-pro');
        expect(getAiModelById('gpt-5.2-pro')?.modelKey).toBe('openai:gpt-5.2-pro');
        expect(getAiModelById('gpt-5.3-codex')?.status).toBe('active');
        expect(getAiModelById('gpt-5-codex')?.recommendedReplacementModelKey).toBe('openai:gpt-5.5');
        expect(getAiModelById('o3-deep-research-2025-06-26')?.modelKey).toBe('openai:o3-deep-research-2025-06-26');
        expect(getAiModelById('o3-deep-research')?.status).toBe('deprecated');
        expect(getAiModelById('claude-fable-5')?.modelKey).toBe('anthropic:claude-fable-5');
        expect(getAiModelById('claude-fable-5')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('claude-mythos-5')?.status).toBe('specialized');
        expect(getAiModelById('claude-opus-4-8')?.modelKey).toBe('anthropic:claude-opus-4-8');
        expect(getAiModelById('claude-opus-4-8')?.recommendedReplacementModelKey).toBe('anthropic:claude-fable-5');
        expect(getAiModelById('claude-opus-4-7')?.recommendedReplacementModelKey).toBe('anthropic:claude-opus-4-8');
        expect(getAiModelById('claude-opus-4-1-20250805')?.status).toBe('deprecated');
        expect(getAiModelById('claude-opus-4-1-20250805')?.recommendedReplacementModelKey).toBe('anthropic:claude-opus-4-8');
        expect(getAiModelById('claude-haiku-4-5')?.modelId).toBe('claude-haiku-4-5-20251001');
        expect(getAiModelById('claude-3-5-haiku')?.modelKey).toBe('anthropic:claude-3-5-haiku-20241022');
        expect(getAiModelById('claude-3-5-haiku-20241022')?.modelKey).toBe('anthropic:claude-3-5-haiku-20241022');
        expect(inferAiProviderFromModel('claude-sonnet-4-6')).toBe('anthropic');
    });

    it('derives shared vision support from the catalog with conservative fallbacks', () => {
        expect(aiModelSupportsVision('gpt-5.5')).toBe(true);
        expect(aiModelSupportsVision('gpt-4.1')).toBe(true);
        expect(aiModelSupportsVision('claude-sonnet-4-6')).toBe(true);
        expect(aiModelSupportsVision('whisper-1')).toBe(false);
    });

    it('filters shared agent-chat candidates using catalog capabilities and status', () => {
        expect(isAiAgentChatCandidate('gpt-5.5')).toBe(true);
        expect(isAiAgentChatCandidate('chat-latest')).toBe(true);
        expect(isAiAgentChatCandidate('o3-deep-research')).toBe(false);
        expect(isAiAgentChatCandidate('gpt-5.5-pro')).toBe(false);
        expect(isAiAgentChatCandidate('claude-fable-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-mythos-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-opus-4-8')).toBe(true);
        expect(isAiAgentChatCandidate('claude-sonnet-4-6')).toBe(true);
        expect(isAiAgentChatCandidate('claude-3-7-sonnet-20250219')).toBe(false);
    });
});
