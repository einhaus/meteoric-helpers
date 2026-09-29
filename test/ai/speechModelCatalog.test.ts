import { describe, expect, it } from 'vitest';
import { auditProviderSpeechModels, buildSpeechCatalogAuditSummary } from '../../src/ai/speechModelCatalogSync.js';
import { SPEECH_PROVIDER_MODEL_PROFILES } from '../../src/ai/speechModelProfiles.js';
import {
    evaluateSpeechModelProfileCostPolicy,
    getPreferredSpeechModelId,
    getSpeechModelByKey,
    getSpeechModelCatalog,
    inferSpeechProviderFromModel,
    listSpeechModelProfileCostPolicyViolations,
    listSpeechModels,
    normalizeSpeechModelKey,
    resolveSpeechModelConfig,
    resolveSpeechModelId
} from '../../src/ai/speechModelSelectors.js';

const OUTDATED_STATUSES = new Set(['deprecated', 'retired']);

describe('speech model catalog', () => {
    it('keeps catalog entries internally consistent', () => {
        const catalog = getSpeechModelCatalog();
        const modelKeys = catalog.map((model) => model.modelKey);

        expect(catalog.length).toBeGreaterThan(0);
        expect(new Set(modelKeys).size).toBe(modelKeys.length);

        for (const model of catalog) {
            expect(model.modelKey).toBe(`${model.provider}:${model.modelId}`);
            expect(model.sources.length).toBeGreaterThan(0);
            for (const source of model.sources) {
                expect(source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            }

            if (model.recommendedReplacementModelKey) {
                const replacement = getSpeechModelByKey(model.recommendedReplacementModelKey);
                expect(replacement).not.toBeNull();
                expect(OUTDATED_STATUSES.has(replacement!.status)).toBe(false);
                expect(replacement!.status).not.toBe('legacy');
            }

            if (OUTDATED_STATUSES.has(model.status) || model.status === 'legacy') {
                expect(model.recommendedReplacementModelKey).not.toBeNull();
            }
        }
    });

    it('resolves the shared profile defaults to current catalog models', () => {
        expect(getPreferredSpeechModelId({ provider: 'elevenlabs', profile: 'narration' })).toBe('eleven_v4');
        expect(getPreferredSpeechModelId({ provider: 'elevenlabs', profile: 'realtime' })).toBe('eleven_v4_turbo');
        expect(getPreferredSpeechModelId({ provider: 'elevenlabs', profile: 'cheap' })).toBe('eleven_flash_v2_5');
        expect(getPreferredSpeechModelId({ profile: 'narration' })).toBe('eleven_v4');

        for (const modelKey of Object.values(SPEECH_PROVIDER_MODEL_PROFILES.elevenlabs)) {
            expect(modelKey).not.toBeNull();
            expect(getSpeechModelByKey(modelKey!)?.status).toBe('active');
        }
    });

    it('keeps profile defaults inside the character cost policies', () => {
        expect(listSpeechModelProfileCostPolicyViolations()).toEqual([]);

        const narrationTurbo = evaluateSpeechModelProfileCostPolicy({
            provider: 'elevenlabs',
            profile: 'narration',
            candidateModelKey: 'elevenlabs:eleven_v4_turbo'
        });
        expect(narrationTurbo.isWithinPolicy).toBe(true);

        const realtimeFullRate = evaluateSpeechModelProfileCostPolicy({
            provider: 'elevenlabs',
            profile: 'realtime',
            candidateModelKey: 'elevenlabs:eleven_v4'
        });
        expect(realtimeFullRate.isWithinPolicy).toBe(false);
        expect(realtimeFullRate.violations).toEqual([expect.stringContaining('character cost multiplier 1 exceeds profile limit 0.5')]);

        const deprecatedDefault = evaluateSpeechModelProfileCostPolicy({
            provider: 'elevenlabs',
            profile: 'cheap',
            candidateModelKey: 'elevenlabs:eleven_turbo_v2_5'
        });
        expect(deprecatedDefault.isWithinPolicy).toBe(false);
        expect(deprecatedDefault.violations).toEqual([expect.stringContaining('is deprecated')]);
    });

    it('normalizes raw and provider-prefixed identifiers into catalog keys', () => {
        expect(normalizeSpeechModelKey('eleven_v4')).toBe('elevenlabs:eleven_v4');
        expect(normalizeSpeechModelKey(' ElevenLabs:eleven_v4_turbo ')).toBe('elevenlabs:eleven_v4_turbo');
        expect(normalizeSpeechModelKey('eleven_multilingual_v2')).toBe('elevenlabs:eleven_multilingual_v2');
        expect(normalizeSpeechModelKey('not-a-model')).toBeNull();
        expect(normalizeSpeechModelKey('')).toBeNull();

        expect(inferSpeechProviderFromModel('eleven_v4')).toBe('elevenlabs');
        expect(inferSpeechProviderFromModel('eleven_custom_finetune')).toBe('elevenlabs');
        expect(inferSpeechProviderFromModel('gpt-6-sol')).toBeNull();
    });

    it('lists models by status and tag', () => {
        const activeNarration = listSpeechModels({ provider: 'elevenlabs', statuses: ['active'], tags: ['narration'] });
        expect(activeNarration.map((model) => model.modelId)).toEqual(['eleven_v4', 'eleven_multilingual_v2']);

        const deprecated = listSpeechModels({ statuses: ['deprecated'] });
        expect(deprecated.map((model) => model.modelId).sort()).toEqual(['eleven_turbo_v2', 'eleven_turbo_v2_5']);
    });

    it('resolves the profile default when no override is given', () => {
        const config = resolveSpeechModelConfig({ profile: 'narration' });

        expect(config.provider).toBe('elevenlabs');
        expect(config.modelKey).toBe('elevenlabs:eleven_v4');
        expect(config.modelId).toBe('eleven_v4');
        expect(config.requestedModel).toBeNull();
        expect(config.catalogEntry?.status).toBe('active');
        expect(config.warnings).toEqual([]);
        expect(config.overridesApplied).toEqual([]);

        expect(resolveSpeechModelId({ profile: 'realtime' })).toBe('eleven_v4_turbo');
        expect(resolveSpeechModelId({ profile: 'narration', model: '   ' })).toBe('eleven_v4');
        expect(resolveSpeechModelId({ profile: 'narration', model: null })).toBe('eleven_v4');
    });

    it('honors explicit current and legacy overrides', () => {
        const explicit = resolveSpeechModelConfig({ profile: 'narration', model: 'eleven_multilingual_v2' });
        expect(explicit.modelId).toBe('eleven_multilingual_v2');
        expect(explicit.overridesApplied).toEqual(['model']);
        expect(explicit.warnings).toEqual([]);

        const legacy = resolveSpeechModelConfig({ profile: 'narration', model: 'elevenlabs:eleven_v3' });
        expect(legacy.modelId).toBe('eleven_v3');
        expect(legacy.modelKey).toBe('elevenlabs:eleven_v3');
        expect(legacy.warnings).toEqual([expect.stringContaining('legacy')]);
    });

    it('upgrades deprecated overrides to their recommended replacement', () => {
        const upgraded = resolveSpeechModelConfig({ profile: 'cheap', model: 'eleven_turbo_v2_5' });

        expect(upgraded.requestedModel).toBe('eleven_turbo_v2_5');
        expect(upgraded.modelKey).toBe('elevenlabs:eleven_flash_v2_5');
        expect(upgraded.modelId).toBe('eleven_flash_v2_5');
        expect(upgraded.warnings).toEqual([expect.stringContaining('was automatically upgraded')]);
    });

    it('passes unknown overrides through so custom provider models keep working', () => {
        const custom = resolveSpeechModelConfig({ profile: 'narration', model: 'eleven_custom_finetune' });

        expect(custom.modelId).toBe('eleven_custom_finetune');
        expect(custom.modelKey).toBeNull();
        expect(custom.catalogEntry).toBeNull();
        expect(custom.warnings).toEqual([expect.stringContaining('is not in the shared elevenlabs catalog')]);
    });

    it('audits discovered provider models against the catalog', () => {
        const result = auditProviderSpeechModels({
            provider: 'elevenlabs',
            discoveredModels: [
                {
                    modelId: 'eleven_v4',
                    displayName: 'Eleven v4',
                    characterCostMultiplier: 1,
                    maxCharactersPerRequest: 10_000,
                    languageCount: 85
                },
                {
                    modelId: 'eleven_v4_turbo',
                    displayName: 'Eleven v4 Turbo',
                    characterCostMultiplier: 0.75,
                    maxCharactersPerRequest: 10_000,
                    languageCount: 85
                },
                {
                    modelId: 'eleven_v5_preview',
                    displayName: 'Eleven v5 preview',
                    characterCostMultiplier: 1,
                    maxCharactersPerRequest: 10_000,
                    languageCount: 90
                }
            ]
        });

        expect(result.missingFromCatalog).toEqual(['eleven_v5_preview']);
        expect(result.missingFromProvider).toEqual(['eleven_flash_v2', 'eleven_flash_v2_5', 'eleven_multilingual_v2']);
        expect(result.metadataMismatches).toEqual([
            {
                modelId: 'eleven_v4_turbo',
                field: 'characterCostMultiplier',
                catalogValue: 0.5,
                providerValue: 0.75
            }
        ]);

        expect(buildSpeechCatalogAuditSummary({ generatedAt: '2026-09-28T00:00:00.000Z', providers: [result] })).toBe(
            'elevenlabs: discovered=3, missingFromCatalog=1, missingFromProvider=3, metadataMismatches=1'
        );
    });
});
