import { describe, expect, it } from 'vitest';
import {
    aiModelSupportsVision,
    estimateAiModelCostUsd,
    getAiModelById,
    getPreferredAiModelId,
    getPreferredAiModelInferenceProfileKey,
    getPreferredAiModelProfileConfig,
    inferAiProviderFromModel,
    isAiAgentChatCandidate,
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
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'reasoning' })).toBe('gpt-5.5');
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'balanced' })).toBe('gpt-5.5');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'fast', preferSnapshot: true })).toBe('claude-haiku-4-5-20251001');
    });

    it('resolves preferred model profiles as model and inference-profile combinations', () => {
        const openAiReasoningProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'reasoning' });
        const openAiBalancedProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'balanced' });

        expect(openAiReasoningProfile?.modelKey).toBe('openai:gpt-5.5');
        expect(openAiReasoningProfile?.inferenceProfileKey).toBe('reasoning_high');
        expect(openAiReasoningProfile?.model?.modelId).toBe('gpt-5.5');
        expect(openAiBalancedProfile?.modelKey).toBe('openai:gpt-5.5');
        expect(openAiBalancedProfile?.inferenceProfileKey).toBe('reasoning_medium');
        expect(getPreferredAiModelInferenceProfileKey('anthropic', 'reasoning')).toBe('reasoning_high');
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
        expect(getAiModelById('gpt-5.3-chat-latest')?.status).toBe('active');
        expect(getAiModelById('gpt-5-chat-latest')?.recommendedReplacementModelKey).toBe('openai:gpt-5.3-chat-latest');
        expect(getAiModelById('gpt-5.5-pro')?.modelKey).toBe('openai:gpt-5.5-pro');
        expect(getAiModelById('gpt-5.2-pro')?.modelKey).toBe('openai:gpt-5.2-pro');
        expect(getAiModelById('o3-deep-research-2025-06-26')?.modelKey).toBe('openai:o3-deep-research-2025-06-26');
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
        expect(isAiAgentChatCandidate('o3-deep-research')).toBe(false);
        expect(isAiAgentChatCandidate('gpt-5.5-pro')).toBe(false);
        expect(isAiAgentChatCandidate('claude-sonnet-4-6')).toBe(true);
        expect(isAiAgentChatCandidate('claude-3-7-sonnet-20250219')).toBe(false);
    });
});
