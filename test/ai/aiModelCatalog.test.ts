import { describe, expect, it } from 'bun:test';
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
    it('catalogs GPT-6.2 Astra at its published rates and keeps it outside the premium creative budget', () => {
        const model = getAiModelById('gpt-6.2-astra');
        expect(model?.contextWindowTokens).toBe(1_050_000);
        expect(model?.maxOutputTokens).toBe(128_000);
        expect(model?.capabilities.reasoningEffortLevels).not.toContain('none');
        expect(model?.pricing).toMatchObject({
            inputUsdPerMillionTokens: 8,
            cachedInputUsdPerMillionTokens: 0.4,
            outputUsdPerMillionTokens: 40,
            cacheWrite12hUsdPerMillionTokens: 20,
            longContextCachedInputUsdPerMillionTokens: 0.8,
            longContextCacheWrite12hUsdPerMillionTokens: 40,
            longContextOutputUsdPerMillionTokens: 60
        });
        expect(
            evaluateAiModelProfileCostPolicy({
                provider: 'openai',
                profile: 'creativeWritingPremium',
                candidateModelKey: 'openai:gpt-6.2-astra'
            }).isWithinPolicy
        ).toBe(false);
    });

    it('catalogs Genie 4 for its documented media modalities', () => {
        const model = getAiModelById('models/genie-4', 'google');
        expect(model?.status).toBe('specialized');
        expect(model?.inputModalities).toEqual(['text', 'image']);
        expect(model?.outputModalities).toEqual(['video', 'audio']);
        expect(model?.capabilities.supportsStreaming).toBe(true);
        expect(model?.maxOutputTokens).toBeNull();
        expect(isAiAgentChatCandidate('genie-4', 'google')).toBe(false);
        expect(estimateAiModelCostUsd({ provider: 'google', model: 'genie-4', inputTokens: 100, outputTokens: 1_000 })).toBeNull();
    });

    it('keeps GPT-Live-1.1 in the catalog without offering it for text chat or token estimates', () => {
        const model = getAiModelById('gpt-live-1.1', 'openai');
        expect(model?.status).toBe('specialized');
        expect(model?.inputModalities).toEqual(['audio', 'text']);
        expect(model?.outputModalities).toEqual(['audio', 'text']);
        expect(model?.capabilities.supportsStreaming).toBe(true);
        expect(isAiAgentChatCandidate('gpt-live-1.1', 'openai')).toBe(false);
        expect(estimateAiModelCostUsd({ model: 'gpt-live-1.1', inputTokens: 100, outputTokens: 1_000 })).toBeNull();
    });

    it('catalogs GPT-6.2 Sol and promotes it for OpenAI creativeWritingPremium within policy', () => {
        const model = getAiModelById('gpt-6.2-sol');
        expect(model?.status).toBe('active');
        expect(model?.snapshotModelId).toBe('gpt-6.2-sol');
        expect(model?.contextWindowTokens).toBe(1_050_000);
        expect(model?.maxOutputTokens).toBe(128_000);
        expect(model?.knowledgeCutoff).toBe('2026-06-01');
        expect(model?.capabilities.reasoningEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
        expect(model?.pricing.inputUsdPerMillionTokens).toBe(2);
        expect(model?.pricing.cachedInputUsdPerMillionTokens).toBe(0.1);
        expect(model?.pricing.outputUsdPerMillionTokens).toBe(10);
        expect(normalizeAiModelKey('gpt-6.2-sol')).toBe('openai:gpt-6.2-sol');
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'creativeWritingPremium' })).toBe('gpt-6.2-sol');

        const evaluation = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'creativeWritingPremium'
        });
        expect(evaluation.isWithinPolicy).toBe(true);
        expect(evaluation.inputPriceMultiplier).toBe(1);
        expect(evaluation.cachedInputPriceMultiplier).toBe(0.5);
        expect(evaluation.outputPriceMultiplier).toBe(0.833333333333);
    });

    it('catalogs GPT-6.1 Terra without promoting shared defaults', () => {
        const model = getAiModelById('gpt-6.1-terra');
        expect(model?.status).toBe('active');
        expect(model?.snapshotModelId).toBe('gpt-6.1-terra');
        expect(model?.contextWindowTokens).toBe(1_050_000);
        expect(model?.maxOutputTokens).toBe(128_000);
        expect(model?.knowledgeCutoff).toBe('2026-06-01');
        expect(model?.capabilities.reasoningEffortLevels).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
        expect(model?.capabilities.supportsComputerUse).toBe(true);
        expect(model?.pricing.inputUsdPerMillionTokens).toBe(1);
        expect(model?.pricing.cachedInputUsdPerMillionTokens).toBe(0.05);
        expect(model?.pricing.outputUsdPerMillionTokens).toBe(5);
        expect(model?.pricing.longContextOutputUsdPerMillionTokens).toBe(7.5);

        const evaluation = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'balanced',
            candidateModelKey: 'openai:gpt-6.1-terra'
        });
        expect(evaluation.isWithinPolicy).toBe(true);
        expect(evaluation.inputPriceMultiplier).toBe(0.5);
        expect(evaluation.cachedInputPriceMultiplier).toBe(0.25);
        expect(evaluation.outputPriceMultiplier).toBe(0.416666666667);
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'balanced' })).toBe('gpt-6-sol');
    });

    it('keeps GPT-6 Rosalind limits unknown and declines estimates without a published pricing threshold', () => {
        const model = getAiModelById('gpt-6-rosalind');
        expect(model?.status).toBe('specialized');
        expect(model?.snapshotModelId).toBeNull();
        expect(model?.contextWindowTokens).toBeNull();
        expect(model?.maxOutputTokens).toBeNull();
        expect(model?.capabilities.supportsToolCalling).toBeNull();
        expect(model?.pricing.inputUsdPerMillionTokens).toBe(15);
        expect(model?.pricing.outputUsdPerMillionTokens).toBe(75);
        expect(model?.pricing.longContextInputUsdPerMillionTokens).toBe(30);
        expect(model?.pricing.longContextThresholdInputTokens).toBeNull();
        expect(estimateAiModelCostUsd({ model: 'gpt-6-rosalind', inputTokens: 1_000, outputTokens: 100 })).toBeNull();
        expect(estimateAiModelCostUsd({ model: 'gpt-rosalind-research', inputTokens: 1_000, outputTokens: 100 })?.totalCostUsd).toBe(
            0.0075
        );
    });

    it('estimates GPT-6 Cyber short-context rates and declines unpublished long-context rates', () => {
        const model = getAiModelById('gpt-6-cyber');
        expect(model?.status).toBe('specialized');
        expect(model?.snapshotModelId).toBe('gpt-6-cyber');
        expect(model?.contextWindowTokens).toBe(1_050_000);
        expect(model?.maxOutputTokens).toBe(128_000);
        expect(model?.capabilities.supportsComputerUse).toBe(true);
        expect(model?.capabilities.supportsReasoningEffort).toBeNull();
        expect(
            estimateAiModelCostUsd({
                model: 'gpt-6-cyber',
                inputTokens: 1_000,
                outputTokens: 100,
                cacheReadInputTokens: 1_000,
                cacheWriteInputTokens: 1_000,
                cacheWriteMode: '12h'
            })
        ).toMatchObject({ totalCostUsd: 0.082, longContextApplied: false });
        expect(estimateAiModelCostUsd({ model: 'gpt-6-cyber', inputTokens: 272_001, outputTokens: 100 })).toBeNull();
        expect(getAiModelById('gpt-5.6-cyber')?.pricing.cacheWrite12hUsdPerMillionTokens).toBe(31.25);
    });

    it.each(['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'])('catalogs %s with distinct text and image token prices', (modelId) => {
        expect(getAiModelById(modelId)).toMatchObject({
            snapshotModelId: modelId,
            status: 'specialized',
            outputModalities: ['image'],
            pricing: {
                inputUsdPerMillionTokens: 5,
                cachedInputUsdPerMillionTokens: 1.25,
                outputUsdPerMillionTokens: null,
                imageTokenPricing: { inputUsdPerMillionTokens: 8, cachedInputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 30 }
            }
        });
        expect(estimateAiModelCostUsd({ model: modelId, inputTokens: 1_000, outputTokens: 100 })).toBeNull();
    });

    it('normalizes provider-prefixed and raw model identifiers into shared model keys', () => {
        expect(normalizeAiModelKey('gpt-6-astra')).toBe('openai:gpt-6-astra');
        expect(normalizeAiModelKey('gpt-6-sol')).toBe('openai:gpt-6-sol');
        expect(normalizeAiModelKey('gpt-6-luna')).toBe('openai:gpt-6-luna');
        expect(normalizeAiModelKey('gpt-5.6')).toBe('openai:gpt-5.6-sol');
        expect(normalizeAiModelKey('gpt-daybreak-blue-latest')).toBe('openai:gpt-daybreak-blue-latest');
        expect(normalizeAiModelKey('gpt-daybreak-red-latest')).toBe('openai:gpt-daybreak-red-latest');
        expect(normalizeAiModelKey('gpt-rosalind-research')).toBe('openai:gpt-rosalind-research');
        expect(normalizeAiModelKey('gpt-5.4-cyber')).toBe('openai:gpt-5.4-cyber');
        expect(normalizeAiModelKey('daybreak-blue-latest')).toBe('openai:gpt-daybreak-blue-latest');
        expect(normalizeAiModelKey('daybreak-red-latest')).toBe('openai:gpt-daybreak-red-latest');
        expect(normalizeAiModelKey('gpt-5.6-terra')).toBe('openai:gpt-5.6-terra');
        expect(normalizeAiModelKey('openai:gpt-5.5')).toBe('openai:gpt-5.5');
        expect(normalizeAiModelKey('claude-opus-5-5')).toBe('anthropic:claude-opus-5-5');
        expect(normalizeAiModelKey('claude-opus-5')).toBe('anthropic:claude-opus-5');
        expect(normalizeAiModelKey('claude-fable-5-1')).toBe('anthropic:claude-fable-5-1');
        expect(normalizeAiModelKey('claude-mythos-5-1')).toBe('anthropic:claude-mythos-5-1');
        expect(normalizeAiModelKey('claude-sonnet-4-6')).toBe('anthropic:claude-sonnet-4-6');
        expect(normalizeAiModelKey('gpt-5.4-mini')).toBe('openai:gpt-5.4-mini');
    });

    it('resolves preferred model ids and uses snapshot ids when requested', () => {
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'reasoning' })).toBe('gpt-6-sol');
        expect(getPreferredAiModelId({ provider: 'openai', profile: 'balanced' })).toBe('gpt-6-sol');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'reasoning' })).toBe('claude-opus-5-5');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'balanced' })).toBe('claude-sonnet-5-5');
        expect(getPreferredAiModelId({ provider: 'anthropic', profile: 'fast', preferSnapshot: true })).toBe('claude-haiku-5-5');
    });

    it('resolves preferred model profiles as model and inference-profile combinations', () => {
        const openAiReasoningProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'reasoning' });
        const openAiBalancedProfile = getPreferredAiModelProfileConfig({ provider: 'openai', profile: 'balanced' });
        const anthropicReasoningProfile = getPreferredAiModelProfileConfig({ provider: 'anthropic', profile: 'reasoning' });
        const anthropicBalancedProfile = getPreferredAiModelProfileConfig({ provider: 'anthropic', profile: 'balanced' });

        expect(openAiReasoningProfile?.modelKey).toBe('openai:gpt-6-sol');
        expect(openAiReasoningProfile?.inferenceProfileKey).toBe('reasoning_high');
        expect(openAiReasoningProfile?.model?.modelId).toBe('gpt-6-sol');
        expect(openAiBalancedProfile?.modelKey).toBe('openai:gpt-6-sol');
        expect(openAiBalancedProfile?.inferenceProfileKey).toBe('reasoning_medium');
        expect(anthropicReasoningProfile?.modelKey).toBe('anthropic:claude-opus-5-5');
        expect(anthropicReasoningProfile?.model?.modelId).toBe('claude-opus-5-5');
        expect(anthropicBalancedProfile?.modelKey).toBe('anthropic:claude-sonnet-5-5');
        expect(anthropicBalancedProfile?.model?.modelId).toBe('claude-sonnet-5-5');
        expect(getPreferredAiModelInferenceProfileKey('anthropic', 'reasoning')).toBe('reasoning_high');
    });

    it('keeps preferred profile defaults inside explicit cost-policy budgets', () => {
        expect(listAiModelProfileCostPolicyViolations()).toEqual([]);

        const compatibleOpusUpgrade = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'reasoning',
            candidateModelKey: 'anthropic:claude-opus-5-5'
        });

        expect(compatibleOpusUpgrade.isWithinPolicy).toBe(true);
        expect(compatibleOpusUpgrade.inputPriceMultiplier).toBe(0.8);
        expect(compatibleOpusUpgrade.cachedInputPriceMultiplier).toBe(0.4);
        expect(compatibleOpusUpgrade.outputPriceMultiplier).toBe(0.8);
        expect(compatibleOpusUpgrade.cacheWrite5mPriceMultiplier).toBe(0.8);
        expect(compatibleOpusUpgrade.cacheWrite1hPriceMultiplier).toBe(0.8);

        const compatibleSonnetUpgrade = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'balanced',
            candidateModelKey: 'anthropic:claude-sonnet-5'
        });

        expect(compatibleSonnetUpgrade.isWithinPolicy).toBe(true);
        expect(compatibleSonnetUpgrade.inputPriceMultiplier).toBe(0.666666666667);
        expect(compatibleSonnetUpgrade.outputPriceMultiplier).toBe(0.666666666667);

        const sonnet55Candidate = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'balanced',
            candidateModelKey: 'anthropic:claude-sonnet-5-5'
        });
        expect(sonnet55Candidate.isWithinPolicy).toBe(true);
        expect(sonnet55Candidate.inputPriceMultiplier).toBe(0.666666666667);
        expect(sonnet55Candidate.cachedInputPriceMultiplier).toBe(0.333333333333);
        expect(sonnet55Candidate.outputPriceMultiplier).toBe(0.666666666667);

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

        const defaultSolCandidate = evaluateAiModelProfileCostPolicy({
            provider: 'openai',
            profile: 'balanced',
            candidateModelKey: 'openai:gpt-6-sol'
        });

        expect(defaultSolCandidate.isWithinPolicy).toBe(true);
        expect(defaultSolCandidate.inputPriceMultiplier).toBe(1);
        expect(defaultSolCandidate.cachedInputPriceMultiplier).toBe(1);
        expect(defaultSolCandidate.outputPriceMultiplier).toBe(0.833333333333);

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
            candidateModelKey: 'openai:gpt-6-luna'
        });

        expect(defaultLunaFastCandidate.isWithinPolicy).toBe(true);
        expect(defaultLunaFastCandidate.inputPriceMultiplier).toBe(0.5);
        expect(defaultLunaFastCandidate.cachedInputPriceMultiplier).toBe(0.5);
        expect(defaultLunaFastCandidate.outputPriceMultiplier).toBe(0.416666666667);

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
        expect(getAiModelById('o3-deep-research')?.status).toBe('retired');
        expect(getAiModelById('o3-deep-research')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('o4-mini-deep-research')?.status).toBe('retired');
        expect(getAiModelById('o4-mini-deep-research')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
    });

    it('filters legacy models unless explicitly requested', () => {
        const defaultOpenAiModels = listAiModels({ provider: 'openai' });
        expect(defaultOpenAiModels.some((model) => model.modelKey === 'openai:gpt-5')).toBe(false);

        const openAiModelsWithLegacy = listAiModels({ provider: 'openai', includeLegacy: true });
        expect(openAiModelsWithLegacy.some((model) => model.modelKey === 'openai:gpt-5')).toBe(true);

        const defaultAnthropicModels = listAiModels({ provider: 'anthropic' });
        expect(defaultAnthropicModels.some((model) => model.modelKey === 'anthropic:claude-3-7-sonnet-20250219')).toBe(false);

        for (const modelId of [
            'claude-opus-5',
            'claude-opus-4-8',
            'claude-opus-4-7',
            'claude-opus-4-6',
            'claude-opus-4-5',
            'claude-fable-5',
            'claude-sonnet-4-6',
            'claude-sonnet-4-5'
        ]) {
            const model = getAiModelById(modelId);
            expect(model?.status).toBe(modelId === 'claude-sonnet-4-5' ? 'deprecated' : 'legacy');
            expect(defaultAnthropicModels).not.toContain(model);
            expect<readonly unknown[]>(listAiModels({ provider: 'anthropic', includeLegacy: true })).toContain(model);
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
            expect<readonly unknown[]>(listAiModels({ provider: 'openai', includeLegacy: true })).toContain(model);
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

    it('prices Haiku 5.5 at the threshold and includes cache tokens when crossing it', () => {
        const atThreshold = estimateAiModelCostUsd({
            model: 'claude-haiku-5-5',
            inputTokens: 98_000,
            cacheReadInputTokens: 1_000,
            cacheWriteInputTokens: 1_000,
            outputTokens: 1_000,
            cacheWriteMode: '1h'
        });
        expect(atThreshold?.longContextApplied).toBe(false);
        expect(atThreshold?.totalCostUsd).toBeCloseTo(0.01051);

        const overThreshold = estimateAiModelCostUsd({
            model: 'claude-haiku-5-5',
            inputTokens: 98_001,
            cacheReadInputTokens: 1_000,
            cacheWriteInputTokens: 1_000,
            outputTokens: 1_000,
            cacheWriteMode: '1h'
        });
        expect(overThreshold?.longContextApplied).toBe(true);
        expect(overThreshold?.cacheWriteCostUsd).toBe(0.001);
        expect(overThreshold?.totalCostUsd).toBeCloseTo(0.0525505);
    });

    it('keeps both standard and long-context Haiku 5.5 pricing within the Haiku policy', () => {
        const candidate = evaluateAiModelProfileCostPolicy({
            provider: 'anthropic',
            profile: 'fast',
            candidateModelKey: 'anthropic:claude-haiku-5-5'
        });
        expect(candidate.isWithinPolicy).toBe(true);
        expect(candidate.inputPriceMultiplier).toBe(0.1);
        expect(candidate.cachedInputPriceMultiplier).toBe(0.1);
        expect(candidate.outputPriceMultiplier).toBe(0.1);
        expect(candidate.cacheWrite5mPriceMultiplier).toBe(0.1);
        expect(candidate.cacheWrite1hPriceMultiplier).toBe(0.1);
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

    it.each([
        ['gpt-6-astra', 12.5, 25],
        ['gpt-6-sol', 2.5, 5],
        ['gpt-6.1-sol', 2.5, 5],
        ['gpt-6.1-terra', 1.25, 2.5],
        ['gpt-6-luna', 0.125, 0.25],
        ['gpt-5.6-sol', 5, 10],
        ['gpt-5.6-terra', 2.5, 5],
        ['gpt-5.6-luna', 0.25, 0.5]
    ] as const)('prices explicit OpenAI cache retention for %s', (model, defaultWriteRate, extendedWriteRate) => {
        const base = { model, inputTokens: 0, outputTokens: 0, cacheWriteInputTokens: 1_000 };
        const defaultEstimate = estimateAiModelCostUsd({ ...base, cacheWriteMode: '30m' });
        const extendedEstimate = estimateAiModelCostUsd({ ...base, cacheWriteMode: '12h' });
        expect(defaultEstimate?.cacheWriteCostUsd).toBeCloseTo(defaultWriteRate / 1_000);
        expect(extendedEstimate?.cacheWriteCostUsd).toBeCloseTo(extendedWriteRate / 1_000);
        expect(extendedEstimate?.cacheWriteMode).toBe('12h');

        const atThreshold = estimateAiModelCostUsd({ ...base, inputTokens: 271_000, cacheWriteMode: '12h' });
        const overThreshold = estimateAiModelCostUsd({ ...base, inputTokens: 271_001, cacheWriteMode: '12h' });
        expect(atThreshold?.longContextApplied).toBe(false);
        expect(atThreshold?.cacheWriteCostUsd).toBeCloseTo(extendedWriteRate / 1_000);
        expect(overThreshold?.longContextApplied).toBe(true);
        expect(overThreshold?.cacheWriteCostUsd).toBeCloseTo((extendedWriteRate * 2) / 1_000);
    });

    it.each(['30m', '12h'] as const)('does not invent %s cache-write pricing for unsupported models', (cacheWriteMode) => {
        for (const model of ['claude-sonnet-5-5', 'gpt-5.4']) {
            expect(
                estimateAiModelCostUsd({ model, inputTokens: 1_000, outputTokens: 100, cacheWriteInputTokens: 1_000, cacheWriteMode })
            ).toBeNull();
        }
    });

    it.each(['gpt-4.1-nano', 'o1', 'o3-mini', 'o4-mini'])('retains %s after its October 23 shutdown', (modelId) => {
        const model = getAiModelById(modelId);
        expect(model?.status).toBe('retired');
        expect(model?.recommendedReplacementModelKey).toBeTruthy();
        expect(model?.pricing.notes).toContain('Retired October 23, 2026');
    });

    it('preserves the retired May 2024 GPT-4o snapshot with its own historical prices', () => {
        const model = getAiModelById('gpt-4o-2024-05-13');
        expect(model?.modelKey).toBe('openai:gpt-4o-2024-05-13');
        expect(model?.status).toBe('retired');
        expect(model?.pricing.inputUsdPerMillionTokens).toBe(5);
        expect(model?.pricing.outputUsdPerMillionTokens).toBe(15);
        expect(model?.maxOutputTokens).toBeNull();
        expect(getAiModelById('gpt-4o')?.status).toBe('deprecated');
        expect(getAiModelById('gpt-4o-2024-08-06')?.modelKey).toBe('openai:gpt-4o');
    });

    it.each(['claude-fable-5-1', 'claude-opus-4-5', 'claude-haiku-4-5', 'claude-sonnet-4-5'])(
        'records API-confirmed web search support for %s',
        (modelId) => {
            const model = getAiModelById(modelId);
            expect(model?.capabilities.supportsWebSearch).toBe(true);
            expect(model?.capabilities.supportsBetweenToolsThinking).toBe(false);
            expect(model?.sources.some((source) => source.url === 'https://platform.claude.com/docs/en/api/models/list')).toBe(true);
        }
    );

    it.each(['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'])(
        'retains deprecated %s metadata with the official January 2027 replacement',
        (modelId) => {
            const model = getAiModelById(modelId);
            expect(model?.status).toBe('deprecated');
            expect(model?.recommendedReplacementModelKey).toBe('openai:gpt-6-luna');
            expect(model?.pricing.notes).toContain('January 14, 2027');
            expect(model?.sources.some((source) => source.url === 'https://developers.openai.com/api/docs/deprecations')).toBe(true);
        }
    );

    it.each(['blue', 'red'])('retains the deprecated Daybreak %s alias separately from its active underlying model', (colour) => {
        const model = getAiModelById(`gpt-daybreak-${colour}-latest`);
        expect(model?.status).toBe('deprecated');
        expect(getAiModelById(`daybreak-${colour}-latest`)?.modelKey).toBe(model?.modelKey);
        const replacement = getAiModelById(model?.recommendedReplacementModelKey ?? '');
        expect(replacement?.status).toMatch(/^(active|specialized)$/);
        expect(model?.pricing.inputUsdPerMillionTokens).toBe(replacement?.pricing.inputUsdPerMillionTokens);
    });

    it('can still resolve legacy models used by current apps', () => {
        expect(getAiModelById('gpt-6-astra')?.contextWindowTokens).toBe(1_050_000);
        expect(getAiModelById('gpt-6-astra')?.capabilities.reasoningEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
        expect(getAiModelById('gpt-6-astra')?.pricing.longContextCacheWriteUsdPerMillionTokens).toBe(25);
        expect(getAiModelById('gpt-6-sol')?.contextWindowTokens).toBe(1_050_000);
        expect(getAiModelById('gpt-6-sol')?.capabilities.reasoningEffortLevels).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
        expect(getAiModelById('gpt-6-sol')?.pricing.longContextOutputUsdPerMillionTokens).toBe(15);
        expect(getAiModelById('gpt-6.1-sol')?.modelKey).toBe('openai:gpt-6.1-sol');
        expect(getAiModelById('gpt-6.1-sol')?.capabilities.reasoningEffortLevels).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
        expect(getAiModelById('gpt-6.1-sol')?.pricing.cachedInputUsdPerMillionTokens).toBe(0.1);
        expect(getAiModelById('gpt-6-luna')?.pricing.outputUsdPerMillionTokens).toBe(0.5);
        expect(getAiModelById('gpt-6-luna')?.pricing.longContextCacheWriteUsdPerMillionTokens).toBe(0.25);
        expect(getAiModelById('gpt-5.6')?.modelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('gpt-5.6-sol')?.capabilities.reasoningEffortLevels).toContain('max');
        expect(getAiModelById('gpt-5.6-sol')?.pricing.inputUsdPerMillionTokens).toBe(4);
        expect(getAiModelById('gpt-5.6-cyber')?.status).toBe('specialized');
        expect(getAiModelById('gpt-5.6-cyber')?.pricing.inputUsdPerMillionTokens).toBe(12.5);
        expect(getAiModelById('gpt-5.6-cyber')?.pricing.longContextOutputUsdPerMillionTokens).toBe(112.5);
        expect(getAiModelById('gpt-rosalind-research')?.status).toBe('specialized');
        expect(getAiModelById('gpt-rosalind-research')?.pricing.inputUsdPerMillionTokens).toBe(5);
        expect(getAiModelById('gpt-rosalind-research')?.pricing.cachedInputUsdPerMillionTokens).toBe(0.5);
        expect(getAiModelById('gpt-rosalind-research')?.pricing.outputUsdPerMillionTokens).toBe(25);
        expect(getAiModelById('gpt-rosalind-research')?.pricing.cacheWriteUsdPerMillionTokens).toBeNull();
        expect(getAiModelById('gpt-5.4-cyber')?.status).toBe('retired');
        expect(getAiModelById('gpt-5.4-cyber')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-cyber');
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
        expect(getAiModelById('gpt-5.3-codex')?.status).toBe('deprecated');
        expect(getAiModelById('gpt-5-codex')?.status).toBe('retired');
        expect(getAiModelById('gpt-5-codex')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('o3-deep-research-2025-06-26')?.modelKey).toBe('openai:o3-deep-research-2025-06-26');
        expect(getAiModelById('o3-deep-research-2025-06-26')?.recommendedReplacementModelKey).toBe('openai:o3-deep-research');
        expect(getAiModelById('o3-deep-research')?.status).toBe('retired');
        expect(getAiModelById('o3-deep-research')?.recommendedReplacementModelKey).toBe('openai:gpt-5.6-sol');
        expect(getAiModelById('o4-mini-deep-research')?.status).toBe('retired');
        expect(getAiModelById('o4-mini-deep-research-2025-06-26')?.status).toBe('retired');
        expect(getAiModelById('o4-mini-deep-research-2025-06-26')?.recommendedReplacementModelKey).toBe('openai:o4-mini-deep-research');
        expect(getAiModelById('claude-fable-5-1')?.modelKey).toBe('anthropic:claude-fable-5-1');
        expect(getAiModelById('claude-fable-5-1')?.knowledgeCutoff).toBe('2026-06');
        expect(getAiModelById('claude-fable-5-1')?.pricing.cachedInputUsdPerMillionTokens).toBe(0.25);
        expect(getAiModelById('claude-fable-5-1')?.capabilities.supportsWebSearch).toBe(true);
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
        expect(getAiModelById('claude-opus-5-5')?.status).toBe('active');
        expect(getAiModelById('claude-opus-5-5')?.snapshotModelId).toBe('claude-opus-5-5');
        expect(getAiModelById('claude-opus-5-5')?.knowledgeCutoff).toBe('2026-06');
        expect(getAiModelById('claude-opus-5-5')?.pricing.inputUsdPerMillionTokens).toBe(4);
        expect(getAiModelById('claude-opus-5-5')?.pricing.cachedInputUsdPerMillionTokens).toBe(0.2);
        expect(getAiModelById('claude-opus-5-5')?.pricing.outputUsdPerMillionTokens).toBe(20);
        expect(getAiModelById('claude-opus-5-5')?.capabilities.supportsComputerUse).toBe(true);
        expect(getAiModelById('claude-opus-5-5')?.capabilities.requiresAdaptiveThinking).toBe(true);
        expect(getAiModelById('claude-opus-5-5')?.parameterPolicies?.forcedToolChoice).toBe('unsupported');
        expect(getAiModelById('claude-opus-5')?.status).toBe('legacy');
        expect(getAiModelById('claude-opus-5')?.recommendedReplacementModelKey).toBe('anthropic:claude-opus-5-5');
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
        expect(getAiModelById('claude-sonnet-5')?.recommendedReplacementModelKey).toBe('anthropic:claude-sonnet-5-5');
        expect(getAiModelById('claude-sonnet-5-5')?.status).toBe('active');
        expect(getAiModelById('claude-sonnet-5-5')?.maxOutputTokens).toBe(128_000);
        expect(getAiModelById('claude-sonnet-5-5')?.parameterPolicies?.forcedToolChoice).toBe('unsupported');
        expect(getAiModelById('claude-sonnet-4-5')?.recommendedReplacementModelKey).toBe('anthropic:claude-sonnet-5-5');
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
        expect(aiModelSupportsVision('gpt-6-experimental')).toBe(true);
        expect(aiModelSupportsVision('gpt-4.1')).toBe(true);
        expect(aiModelSupportsVision('claude-sonnet-4-6')).toBe(true);
        expect(aiModelSupportsVision('whisper-1')).toBe(false);
    });

    it('filters shared agent-chat candidates using catalog capabilities and status', () => {
        expect(isAiAgentChatCandidate('gpt-6-astra')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-6-sol')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-6-luna')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-6-experimental')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.6-sol')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.6-terra')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.6-luna')).toBe(true);
        expect(isAiAgentChatCandidate('gpt-5.5')).toBe(true);
        expect(isAiAgentChatCandidate('chat-latest')).toBe(true);
        expect(isAiAgentChatCandidate('o3-deep-research')).toBe(false);
        expect(isAiAgentChatCandidate('gpt-5.5-pro')).toBe(false);
        expect(isAiAgentChatCandidate('claude-fable-5-2')).toBe(true);
        expect(isAiAgentChatCandidate('claude-fable-5-1')).toBe(false);
        expect(isAiAgentChatCandidate('claude-fable-5')).toBe(false);
        expect(isAiAgentChatCandidate('claude-mythos-5-1')).toBe(true);
        expect(isAiAgentChatCandidate('claude-mythos-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-opus-5-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-opus-5')).toBe(false);
        expect(isAiAgentChatCandidate('claude-opus-4-8')).toBe(false);
        expect(isAiAgentChatCandidate('claude-sonnet-5')).toBe(false);
        expect(isAiAgentChatCandidate('claude-sonnet-5-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-haiku-5-5')).toBe(true);
        expect(isAiAgentChatCandidate('claude-sonnet-4-6')).toBe(false);
        expect(isAiAgentChatCandidate('claude-3-7-sonnet-20250219')).toBe(false);
        expect(isAiAgentChatCandidate('gemini-4-carbon')).toBe(true);
        expect(isAiAgentChatCandidate('gemini-4-neon')).toBe(true);
        expect(isAiAgentChatCandidate('gemini-4-hydrogen')).toBe(true);
        expect(isAiAgentChatCandidate('gemini-2.5-flash')).toBe(false);
        expect(isAiAgentChatCandidate('gemini-3.8-flash-tts')).toBe(false);
        expect(isAiAgentChatCandidate('gemini-experimental')).toBe(true);
        expect(isAiAgentChatCandidate('grok-4.7')).toBe(true);
        expect(isAiAgentChatCandidate('grok-4.3')).toBe(true);
        expect(isAiAgentChatCandidate('grok-4-1-fast-reasoning')).toBe(true);
        expect(isAiAgentChatCandidate('grok-build-0.1')).toBe(true);
        expect(isAiAgentChatCandidate('grok-4.6')).toBe(false);
        expect(isAiAgentChatCandidate('grok-future-chat')).toBe(true);
        expect(isAiAgentChatCandidate('grok-imagine-1')).toBe(false);
    });

    it('supports Google Gemini models across text routing, profiles, cost policies, and cost estimation', () => {
        expect(inferAiProviderFromModel('gemini-4-neon')).toBe('google');
        expect(inferAiProviderFromModel('models/gemini-4-hydrogen')).toBe('google');
        expect(normalizeAiModelKey('models/gemini-4-hydrogen')).toBe('google:gemini-4-hydrogen');
        expect(normalizeAiModelKey('google:models/gemini-4-carbon')).toBe('google:gemini-4-carbon');
        expect(normalizeAiModelKey('gemini-4-neon')).toBe('google:gemini-4-neon');

        expect(getPreferredAiModelId({ provider: 'google', profile: 'creativeWritingPremium' })).toBe('gemini-4-neon');
        expect(getPreferredAiModelId({ provider: 'google', profile: 'reasoning' })).toBe('gemini-4-carbon');
        expect(getPreferredAiModelId({ provider: 'google', profile: 'balanced' })).toBe('gemini-4-hydrogen');
        expect(getPreferredAiModelId({ provider: 'google', profile: 'fast' })).toBe('gemini-3.8-flash');
        expect(getPreferredAiModelId({ provider: 'google', profile: 'cheap' })).toBe('gemini-3.5-flash-lite');
        expect(getPreferredAiModelId({ provider: 'google', profile: 'deepResearch' })).toBeNull();

        expect(aiModelSupportsVision('gemini-4-neon')).toBe(true);
        expect(aiModelSupportsVision('gemini-3.8-flash-tts')).toBe(false);
        expect(aiModelSupportsVision('gemini-future-flash')).toBe(true);

        const neonCost = estimateAiModelCostUsd({
            model: 'gemini-4-neon',
            inputTokens: 100_000,
            cacheReadInputTokens: 100_000,
            outputTokens: 10_000
        });
        expect(neonCost).toMatchObject({
            modelKey: 'google:gemini-4-neon',
            inputCostUsd: 0.3,
            cacheReadCostUsd: 0.015,
            outputCostUsd: 0.15,
            totalCostUsd: 0.465,
            longContextApplied: false
        });

        const unapprovedNeonBalanced = evaluateAiModelProfileCostPolicy({
            provider: 'google',
            profile: 'balanced',
            candidateModelKey: 'google:gemini-4-neon'
        });
        expect(unapprovedNeonBalanced.isWithinPolicy).toBe(false);
        expect(unapprovedNeonBalanced.inputPriceMultiplier).toBe(2);
        expect(unapprovedNeonBalanced.outputPriceMultiplier).toBe(2);

        const defaultGoogleModels = listAiModels({ provider: 'google' });
        expect(defaultGoogleModels.some((model) => model.modelKey === 'google:gemini-4-neon')).toBe(true);
        expect(defaultGoogleModels.some((model) => model.modelKey === 'google:gemini-2.5-flash')).toBe(false);
    });

    it('supports xAI Grok models across catalog lookup, profiles, cost policies, and long-context pricing', () => {
        expect(inferAiProviderFromModel('grok-4.7')).toBe('xai');
        expect(inferAiProviderFromModel('xai:grok-4.3')).toBe('xai');
        expect(normalizeAiModelKey('grok-4.7')).toBe('xai:grok-4.7');
        expect(normalizeAiModelKey('grok-4.3-0815')).toBe('xai:grok-4.3');
        expect(normalizeAiModelKey('xai:grok-4.20')).toBe('xai:grok-4.20-0309-reasoning');

        expect(getPreferredAiModelId({ provider: 'xai', profile: 'reasoning' })).toBe('grok-4.7');
        expect(getPreferredAiModelId({ provider: 'xai', profile: 'balanced' })).toBe('grok-4.7');
        expect(getPreferredAiModelId({ provider: 'xai', profile: 'fast' })).toBe('grok-4-1-fast-reasoning');
        expect(getPreferredAiModelId({ provider: 'xai', profile: 'cheap' })).toBe('grok-4-1-fast-non-reasoning');
        expect(getPreferredAiModelId({ provider: 'xai', profile: 'deepResearch' })).toBeNull();

        expect(aiModelSupportsVision('grok-4.7')).toBe(true);
        expect(aiModelSupportsVision('grok-build-0.1')).toBe(false);
        expect(aiModelSupportsVision('grok-4.9-preview')).toBe(true);

        const standardEstimate = estimateAiModelCostUsd({
            model: 'grok-4.7',
            inputTokens: 100_000,
            cacheReadInputTokens: 50_000,
            outputTokens: 10_000
        });
        expect(standardEstimate).toMatchObject({
            modelKey: 'xai:grok-4.7',
            inputCostUsd: 0.2,
            cacheReadCostUsd: 0.025,
            outputCostUsd: 0.06,
            totalCostUsd: 0.285,
            longContextApplied: false
        });

        const longContextEstimate = estimateAiModelCostUsd({
            model: 'grok-4.7',
            inputTokens: 200_001,
            outputTokens: 10_000
        });
        expect(longContextEstimate?.longContextApplied).toBe(true);
        expect(longContextEstimate?.inputCostUsd).toBeCloseTo(0.800004);
        expect(longContextEstimate?.outputCostUsd).toBe(0.12);

        const unapprovedGrokFast = evaluateAiModelProfileCostPolicy({
            provider: 'xai',
            profile: 'fast',
            candidateModelKey: 'xai:grok-4.7'
        });
        expect(unapprovedGrokFast.isWithinPolicy).toBe(false);
        expect(unapprovedGrokFast.inputPriceMultiplier).toBe(10);

        const grok43Balanced = evaluateAiModelProfileCostPolicy({
            provider: 'xai',
            profile: 'balanced',
            candidateModelKey: 'xai:grok-4.3'
        });
        expect(grok43Balanced.isWithinPolicy).toBe(true);

        const defaultXaiModels = listAiModels({ provider: 'xai' });
        expect(defaultXaiModels.some((model) => model.modelKey === 'xai:grok-4.7')).toBe(true);
        expect(defaultXaiModels.some((model) => model.modelKey === 'xai:grok-4.6')).toBe(false);
    });
});
