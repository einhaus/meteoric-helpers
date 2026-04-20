import { describe, expect, it } from 'vitest';
import {
    getAiInferenceProfile,
    listAiInferenceProfiles,
    serializeAiInferenceProfile
} from '../../src/ai/aiInferenceProfiles.js';

describe('AI inference profile helpers', () => {
    it('lists the shared reasoning profiles in sort order', () => {
        const profiles = listAiInferenceProfiles();

        expect(profiles.map((profile) => profile.key)).toEqual([
            'reasoning_none',
            'reasoning_low',
            'reasoning_medium',
            'reasoning_high',
            'reasoning_xhigh'
        ]);
    });

    it('serializes shared inference profiles into provider payload fragments', () => {
        const profile = getAiInferenceProfile('reasoning_medium');
        expect(profile).not.toBeNull();

        const serialized = serializeAiInferenceProfile(profile!);

        expect(serialized.normalizedJson).toBe(JSON.stringify({ reasoningEffort: 'medium' }));
        expect(serialized.openaiParamsJson).toBe(JSON.stringify({ reasoning_effort: 'medium' }));
        expect(serialized.anthropicParamsJson).toBe(JSON.stringify({ thinking: { type: 'enabled', budget_tokens: 2048 } }));
    });

    it('omits anthropic params when the shared profile disables extended thinking', () => {
        const profile = getAiInferenceProfile('reasoning_none');
        expect(profile).not.toBeNull();

        const serialized = serializeAiInferenceProfile(profile!);

        expect(serialized.openaiParamsJson).toBe(JSON.stringify({ reasoning_effort: 'none' }));
        expect(serialized.anthropicParamsJson).toBeNull();
    });
});
