import { describe, expect, it } from 'vitest';
import {
    aiModelSupportsVision,
    estimateAiModelCostUsd,
    evaluateAiModelProfileCostPolicy,
    getAiModelById,
    getAiModelCatalog,
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
        expect(normalizeAiModelKey('gpt-6-astra')).toBe('openai:gpt-6-astra');
        expect(normalizeAiModelKey('gpt-5.6')).toBe('openai:gpt-5.6-sol');
        expect(normalizeAiModelKey('gpt-daybreak-blue-latest')).toBe('openai:gpt-5.6-sol');
        expect(normalizeAiModelKey('gpt-daybreak-red-latest')).toBe('openai:gpt-5.6-cyber');
        expect(normalizeAiModelKey('daybreak-blue-latest')).toBe('openai:gpt-5.6-sol');
        expect(normalizeAiModelKey('daybreak-red-latest')).toBe('openai:gpt-5.6-cyber');
        expect(normalizeAiModelKey('gpt-5.6-terra')).toBe('openai:gpt-5.6-terra');
        expect(normalizeAiModelKey('openai:gpt-5.5')).toBe('openai:gpt-5.5');
        expect(normalizeAiModelKey('claude-opus-5')).toBe('anthropic:claude-opus-5');
        expect(normalizeAiModelKey('claude-fable-5-1')).toBe('anthropic:claude-fable-5-1');
        expect(normalizeAiModelKey('claude-mythos-5-1')).toBe('anthropic:claude-mythos-5-1');
        expect(normalizeAiModelKey('claude-sonnet-4-6')).toBe('anthropic:claude-sonnet-4-6');
        expect(normalizeAiModelKey('gpt-5.4-mini')).toBe('openai:gpt-5.4-mini');
    });

    it('resolves preferred model ids and uses snapshot ids when requested', () => {
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'reasoning' })).toBe('gpt-5.6-terra');
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'balanced' })).toBe('gpt-5.6-terra');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'reasoning' })).toBe('claude-opus-5');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'balanced' })).toBe('claude-sonnet-5');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'fast', preferSnapshot: true })).toBe('claude-haiku-4-5-20251001');
    });

    it('resolves preferred model profiles as model and inference-profile combinations', () => {
        const openAiReasoningProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'reasoning' });
        const openAiBalancedProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'balanced' });
        const anthropicReasoningProfile = getPreferredAiModelProfileConfig({ provider: 'anthropic', profile: 'reasoning' });
        const anthropicBalancedProfile = getPreferredAiModelProfileConfig({ provider: 'anthropic', profile: 'balanced' });

        expect(openAiReasoningProfile?.modelKey).toBe('openai:gpt-5.6-terra');
        expect(openAiReasoningProfile?.inferenceProfileKey).toBe('reasoning_high');
        expect(openAiReasoningProfile?.model?.modelId).toBe('gpt-5.6-terra');
        expect(openAiBalancedProfile?.modelKey).toBe('openai:gpt-5.6-terra');
        expect(openAiBalancedProfile?.inferenceProfileKey).toBe('reasoning_medium');
        expect(anthropicReasoningProfile?.modelKey).toBe('anthropic:claude-opus-5');
        expect(anthropicReasoningProfile?.model?.modelId).toBe('claude-opus-5');
        expect(anthropicBalancedProfile?.modelKey).toBe('anthropic:claude-sonnet-5');
        expect(anthropicBalancedProfile?.model?.modelId).toBe('claude-sonnet-5');
        expect(getPreferredAiModelInferenceProfileKey('anthropic', 'reasoning')).toBe('reasoning_high');
    });

    it('keeps preferred profile defaults inside explicit cost-policy budgets', () => {
        expect(listAiModelProfileCostPolicyViolations()).toEqual([]);

        const compatibleOpusUpgrade = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'reasoning',
            candidateModelKey: 'anthropic:claude-opus-5'
        });

        expect(compatibleOpusUpgrade.isWithinPolicy).toBe(true);
        expect(compatibleOpusUpgrade.inputPriceMultiplier).toBe(1);
        expect(compatibleOpusUpgrade.cachedInputPriceMultiplier).toBe(1);
        expect(compatibleOpusUpgrade.outputPriceMultiplier).toBe(1);
        expect(compatibleOpusUpgrade.cacheWrite5mPriceMultiplier).toBe(1);
        expect(compatibleOpusUpgrade.cacheWrite1hPriceMultiplier).toBe(1);

        const compatibleSonnetUpgrade = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'balanced',
            candidateModelKey: 'anthropic:claude-sonnet-5'
        });

        expect(compatibleSonnetUpgrade.isWithinPolicy).toBe(true);
        expect(compatibleSonnetUpgrade.inputPriceMultiplier).toBe(0.666666666667);
        expect(compatibleSonnetUpgrade.outputPriceMultiplier).toBe(0.666666666667);

        const unapprovedFablePromotion = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'reasoning',
            candidateModelKey: 'anthropic:claude-fable-5-1'
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
        expect(unapprovedGpt55Promotion.inputPriceMultiplier).toBe(2.5);
        expect(unapprovedGpt55Promotion.outputPriceMultiplier).toBe(2.5);
        expect(unapprovedGpt55Promotion.violations).toEqual(
            expect.arrayContaining([
                expect.stringContaining('input price 5 exceeds profile budget 2'),
                expect.stringContaining('output price 30 exceeds profile budget 12')
            ])
        );

        const defaultTerraCandidate = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'balanced',
            candidateModelKey: 'openai:gpt-5.6-terra'
        });

        expect(defaultTerraCandidate.isWithinPolicy).toBe(true);
        expect(defaultTerraCandidate.inputPriceMultiplier).toBe(1);
        expect(defaultTerraCandidate.cachedInputPriceMultiplier).toBe(1);
        expect(defaultTerraCandidate.outputPriceMultiplier).toBe(1);
        expect(getAiModelById('gpt-5.6-terra')?.pricing.cacheWriteUsdPerMillionTokens).toBe(2.5);
        expect(getAiModelById('gpt-5.4')?.pricing.cacheWriteUsdPerMillionTokens).toBeUndefined();

        const unapprovedSolPromotion = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'reasoning',
            candidateModelKey: 'openai:gpt-5.6-sol'
        });

        expect(unapprovedSolPromotion.isWithinPolicy).toBe(false);
        expect(unapprovedSolPromotion.inputPriceMultiplier).toBe(2);
        expect(unapprovedSolPromotion.cachedInputPriceMultiplier).toBe(2);
        expect(unapprovedSolPromotion.outputPriceMultiplier).toBe(1.666666666667);

        const unapprovedAstraPromotion = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'reasoning',
            candidateModelKey: 'openai:gpt-6-astra'
        });

        expect(unapprovedAstraPromotion.isWithinPolicy).toBe(false);
        expect(unapprovedAstraPromotion.inputPriceMultiplier).toBe(5);
        expect(unapprovedAstraPromotion.cachedInputPriceMultiplier).toBe(5);
        expect(unapprovedAstraPromotion.outputPriceMultiplier).toBe(4.166666666667);

        const defaultLunaFastCandidate = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'fast',
            candidateModelKey: 'openai:gpt-5.6-luna'
        });

        expect(defaultLunaFastCandidate.isWithinPolicy).toBe(true);
        expect(defaultLunaFastCandidate.inputPriceMultiplier).toBe(1);
        expect(defaultLunaFastCandidate.cachedInputPriceMultiplier).toBe(1);
        expect(defaultLunaFastCandidate.outputPriceMultiplier).toBe(1);

        const defaultDeepResearchModel = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'deepResearch',
            candidateModelKey: 'openai:gpt-5.6-sol'
        });

        expect(defaultDeepResearchModel.isWithinPolicy).toBe(true);
        expect(defaultDeepResearchModel.isApprovedHigherCost).toBe(false);
        expect(defaultDeepResearchModel.inputPriceMultiplier).toBe(1);
        expect(defaultDeepResearchModel.cachedInputPriceMultiplier).toBe(1);
        expect(defaultDeepResearchModel.outputPriceMultiplier).toBe(1);
        expect(defaultDeepResearchModel.cacheWrite5mPriceMultiplier).toBeNull();
        expect(defaultDeepResearchModel.cacheWrite1hPriceMultiplier).toBeNull();
        expect(getAiModelById('gpt-5.6-sol')?.pricing.longContextInputUsdPerMillionTokens).toBe(8);
        expect(getAiModelById('gpt-5.6-sol')?.pricing.longContextCachedInputUsdPerMillionTokens).toBe(0.8);
        expect(getAiModelById('gpt-5.6-sol')?.pricing.longContextOutputUsdPerMillionTokens).toBe(30);
        expect(getAiModelById('o3-deep-research')?.pricing.inputUsdPerMillionTokens).toBe(10);
        expect(getAiModelById('o3-deep-research')?.pricing.cachedInputUsdPerMillionTokens).toBe(2.5);
        expect(getAiModelById('o3-deep-research')?.pricing.outputUsdPerMillionTokens).toBe(40);
    });

    it('filters legacy models unless explicitly requested', () => {
        const defaultOpenAiModels = listAiModels({ provider: 'openai' });
        expect(defaultOpenAiModels.some((model) => model.modelKey === 'openai:gpt-5')).toBe(false);

        const openAiModelsWithLegacy = listAiModels({ provider: 'openai', includeLegacy: true });
        expect(openAiModelsWithLegacy.some((model) => model.modelKey === 'openai:gpt-5')).toBe(true);

        const defaultAnthropicModels = listAiModels({ provider: 'anthropic' });
        expect(defaultAnthropicModels.some((model) => model.modelKey === 'anthropic:claude-3-7-sonnet-20250219')).toBe(false);

        for (const modelId of [
            'claude-opus-4-8',
            'claude-opus-4-7',
            'claude-opus-4-6',
            'claude-opus-4-5',
            'claude-fable-5',
            'claude-sonnet-4-6',
            'claude-sonnet-4-5'
        ]) {
            const model = getAiModelById(modelId);
            expect(model?.status).toBe('legacy');
            expect(defaultAnthropicModels).not.toContain(model);
            expect(listAiModels({ provider: 'anthropic', includeLegacy: true })).toContain(model);
        }
    });

    it('keeps every outdated model on an acyclic same-provider replacement path to a current model', () => {
        const outdatedStatuses = new Set(['legacy', 'deprecated', 'retired']);

        for (const catalogModel of getAiModelCatalog()) {
            if (!outdatedStatuses.has(catalogModel.status)) continue;

            const visitedModelKeys = new Set([catalogModel.modelKey]);
            let currentModel = catalogModel;

            while (outdatedStatuses.has(currentModel.status)) {
                expect(currentModel.recommendedReplacementModelKey, currentModel.modelKey).not.toBeNull();

                const replacementModel = getAiModelById(currentModel.recommendedReplacementModelKey ?? '');
                expect(replacementModel, currentModel.recommendedReplacementModelKey ?? currentModel.modelKey).not.toBeNull();
                expect(replacementModel?.provider).toBe(catalogModel.provider);
                expect(visitedModelKeys.has(replacementModel?.modelKey ?? '')).toBe(false);

                if (!replacementModel) break;
                visitedModelKeys.add(replacementModel.modelKey);
                currentModel = replacementModel;
            }

            expect(['active', 'specialized']).toContain(currentModel.status);
        }
    });

    it.each(['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'o3'])(
        'preserves deprecated %s snapshots without offering them for agent chat',
        (modelId) => {
            const model = getAiModelById(modelId);

            expect(model?.status).toBe('deprecated');
            expect(getAiModelById(model?.snapshotModelId ?? '')).toBe(model);
            expect(listAiModels({ provider: 'openai', includeLegacy: true })).toContain(model);
            expect(isAiAgentChatCandidate(modelId)).toBe(false);
        }
    );

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

    it('charges generic cache-write pricing for current OpenAI models', () => {
        const standardEstimate = estimateAiModelCostUsd({
            model: 'gpt-5.6-terra',
            inputTokens: 1_000,
            outputTokens: 100,
            cacheWriteInputTokens: 1_000
        });

        expect(standardEstimate?.cacheWriteCostUsd).toBe(0.0025);
        expect(standardEstimate?.totalCostUsd).toBe(0.0057);

        const longContextEstimate = estimateAiModelCostUsd({
            model: 'gpt-5.6-terra',
            inputTokens: 300_000,
            outputTokens: 100_000,
            cacheWriteInputTokens: 1_000
        });

        expect(longContextEstimate?.longContextApplied).toBe(true);
        expect(longContextEstimate?.cacheWriteCostUsd).toBe(0.005);
        expect(longContextEstimate?.totalCostUsd).toBe(3.005);

        const astraEstimate = estimateAiModelCostUsd({
            model: 'gpt-6-astra',
            inputTokens: 300_000,
            outputTokens: 100_000,
            cacheWriteInputTokens: 1_000
        });

        expect(astraEstimate?.longContextApplied).toBe(true);
        expect(astraEstimate?.cacheWriteCostUsd).toBe(0.025);
        expect(astraEstimate?.totalCostUsd).toBe(13.525);
    });

    it('can still resolve legacy models used by current apps', () => {
        expect(getAiModelById('gpt-6-astra')?.contextWindowTokens).toBe(1_050_000);
        expect(getAiModelById('gpt-6-astra')?.capabilities.reasoningEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
        expect(getAiModelById('gpt-6-astra')?.pricing.longContextCacheWriteUsdPerMillionTokens).toBe(25);
        expect(getAiModelById('gpt-5.6')?.modelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('gpt-5.6-sol')?.capabilities.reasoningEffortLevels).toContain('max');
        expect(getAiModelById('gpt-5.6-sol')?.pricing.inputUsdPerMillionTokens).toBe(4);
        expect(getAiModelById('gpt-5.6-cyber')?.status).toBe('specialized');
        expect(getAiModelById('gpt-5.6-cyber')?.pricing.inputUsdPerMillionTokens).toBe(12.5);
        expect(getAiModelById('gpt-5.6-cyber')?.pricing.longContextOutputUsdPerMillionTokens).toBe(112.5);
        expect(getAiModelById('gpt-5.6-terra')?.pricing.longContextOutputUsdPerMillionTokens).toBe(18);
        expect(getAiModelById('gpt-5.6-luna')?.pricing.outputUsdPerMillionTokens).toBe(1.2);
        expect(getAiModelById('gpt-4o-mini')?.modelKey).toBe('openai:gpt-4o-mini');
        expect(getAiModelById('gpt-4o-mini')?.capabilities.supportsMcp).toBe(true);
        expect(getAiModelById('gpt-4o-2024-11-20')?.modelKey).toBe('openai:gpt-4o');
        expect(getAiModelById('chatgpt-4o-latest')?.modelKey).toBe('openai:chatgpt-4o-latest');
        expect(getAiModelById('chat-latest')?.modelKey).toBe('openai:chat-latest');
        expect(getAiModelById('chat-latest')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('chat-latest')?.recommendedReplacementModelKey).toBe('openai:gpt-6-astra');
        expect(getAiModelById('gpt-5.3-chat-latest')?.status).toBe('retired');
        expect(getAiModelById('gpt-5.2-chat-latest')?.status).toBe('retired');
        expect(getAiModelById('gpt-5-chat-latest')?.status).toBe('retired');
        expect(getAiModelById('gpt-5-chat-latest')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('gpt-5.5-pro')?.modelKey).toBe('openai:gpt-5.5-pro');
        expect(getAiModelById('gpt-5.2-pro')?.modelKey).toBe('openai:gpt-5.2-pro');
        expect(getAiModelById('gpt-5.3-codex')?.status).toBe('active');
        expect(getAiModelById('gpt-5-codex')?.status).toBe('retired');
        expect(getAiModelById('gpt-5-codex')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('o3-deep-research-2025-06-26')?.modelKey).toBe('openai:o3-deep-research-2025-06-26');
        expect(getAiModelById('o3-deep-research-2025-06-26')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('o3-deep-research')?.status).toBe('retired');
        expect(getAiModelById('o3-deep-research')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('o4-mini-deep-research-2025-06-26')?.status).toBe('retired');
        expect(getAiModelById('o4-mini-deep-research-2025-06-26')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('claude-fable-5-1')?.modelKey).toBe('anthropic:claude-fable-5-1');
        expect(getAiModelById('claude-fable-5-1')?.knowledgeCutoff).toBe('2026-06');
        expect(getAiModelById('claude-fable-5-1')?.pricing.cachedInputUsdPerMillionTokens).toBe(0.25);
        expect(getAiModelById('claude-fable-5-1')?.capabilities.supportsWebSearch).toBeNull();
        expect(getAiModelById('claude-fable-5')?.modelKey).toBe('anthropic:claude-fable-5');
        expect(getAiModelById('claude-fable-5')?.status).toBe('legacy');
        expect(getAiModelById('claude-fable-5')?.recommendedReplacementModelKey).toBe('anthropic:claude-fable-5-1');
        expect(getAiModelById('claude-fable-5')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('claude-fable-5')?.knowledgeCutoff).toBe('2026-01');
        expect(getAiModelById('claude-fable-5')?.capabilities.supportsWebSearch).toBe(true);
        expect(getAiModelById('claude-fable-5')?.capabilities.supportsComputerUse).toBe(true);
        expect(getAiModelById('claude-mythos-5')?.status).toBe('specialized');
        expect(getAiModelById('claude-mythos-5')?.recommendedReplacementModelKey).toBe('anthropic:claude-mythos-5-1');
        expect(getAiModelById('claude-mythos-5-1')?.status).toBe('specialized');
        expect(getAiModelById('claude-mythos-5-1')?.knowledgeCutoff).toBe('2026-06');
        expect(getAiModelById('claude-mythos-5')?.knowledgeCutoff).toBe('2026-01');
        expect(getAiModelById('claude-mythos-5')?.capabilities.supportsWebSearch).toBe(true);
        expect(getAiModelById('claude-mythos-5')?.capabilities.supportsComputerUse).toBe(true);
        expect(getAiModelById('claude-mythos-preview')?.status).toBe('deprecated');
        expect(getAiModelById('claude-mythos-preview')?.recommendedReplacementModelKey).toBe('anthropic:claude-mythos-5-1');
        expect(getAiModelById('claude-mythos-preview')?.contextWindowTokens).toBe(1_000_000);
        expect(getAiModelById('claude-mythos-preview')?.maxOutputTokens).toBeNull();
        expect(getAiModelById('claude-mythos-preview')?.capabilities.supportsStructuredOutputs).toBe(true);
        expect(getAiModelById('claude-opus-5')?.status).toBe('active');
        expect(getAiModelById('claude-opus-5')?.snapshotModelId).toBe('claude-opus-5');
        expect(getAiModelById('claude-opus-5')?.contextWindowTokens).toBe(1_000_000);
        expect(getAiModelById('claude-opus-5')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('claude-opus-5')?.knowledgeCutoff).toBe('2026-05');
        expect(getAiModelById('claude-opus-5')?.pricing.inputUsdPerMillionTokens).toBe(5);
        expect(getAiModelById('claude-opus-5')?.pricing.outputUsdPerMillionTokens).toBe(25);
        expect(getAiModelById('claude-opus-5')?.capabilities.supportsComputerUse).toBe(true);
        expect(getAiModelById('claude-opus-4-8')?.modelKey).toBe('anthropic:claude-opus-4-8');
        expect(getAiModelById('claude-opus-4-8')?.recommendedReplacementModelKey).toBe('anthropic:claude-opus-5');
        expect(getAiModelById('claude-opus-4-7')?.recommendedReplacementModelKey).toBe('anthropic:claude-opus-5');
        expect(getAiModelById('claude-opus-4-5')?.contextWindowTokens).toBe(200_000);
        expect(getAiModelById('claude-opus-4-5')?.capabilities.supportsExtendedThinking).toBe(true);
        expect(getAiModelById('claude-opus-4-5')?.capabilities.supportsComputerUse).toBe(true);
        expect(getAiModelById('claude-opus-4-6')?.capabilities.supportsComputerUse).toBe(true);
        expect(getAiModelById('claude-opus-4-1-20250805')?.status).toBe('retired');
        expect(getAiModelById('claude-opus-4-1-20250805')?.recommendedReplacementModelKey).toBe('anthropic:claude-opus-4-8');
        expect(getAiModelById('claude-sonnet-5')?.modelKey).toBe('anthropic:claude-sonnet-5');
        expect(getAiModelById('claude-sonnet-5')?.pricing.inputUsdPerMillionTokens).toBe(2);
        expect(getAiModelById('claude-sonnet-5')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('claude-sonnet-5')?.recommendedReplacementModelKey).toBeNull();
        expect(getAiModelById('claude-sonnet-4-6')?.recommendedReplacementModelKey).toBe('anthropic:claude-sonnet-5');
        expect(getAiModelById('claude-sonnet-4-6')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('claude-opus-4')?.status).toBe('retired');
        expect(getAiModelById('claude-sonnet-4')?.status).toBe('retired');
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
        expect(isAiAgentChatCandidate('gpt-6-astra')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.6-sol')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.6-terra')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.6-luna')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.5')).toBe(true);
        expect(isAiAgentChatCandidate('chat-latest')).toBe(true);
        expect(isAiAgentChatCandidate('o3-deep-research')).toBe(false);
        expect(isAiAgentChatCandidate('gpt-5.5-pro')).toBe(false);
        expect(isAiAgentChatCandidate('claude-fable-5-1')).toBe(true);
        expect(isAiAgentChatCandidate('claude-fable-5')).toBe(false);
        expect(isAiAgentChatCandidate('claude-mythos-5-1')).toBe(true);
        expect(isAiAgentChatCandidate('claude-mythos-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-opus-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-opus-4-8')).toBe(false);
        expect(isAiAgentChatCandidate('claude-sonnet-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-sonnet-4-6')).toBe(false);
        expect(isAiAgentChatCandidate('claude-3-7-sonnet-20250219')).toBe(false);
    });
});
