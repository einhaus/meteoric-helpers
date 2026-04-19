import { describe, expect, it } from 'vitest';
import { listAiRequestPresets, resolveAiRequestConfig } from '../../src/ai/aiRequestSelectors.js';

describe('AI request preset helpers', () => {
    it('resolves openai agent chat defaults from the shared preset catalog', () => {
        const config = resolveAiRequestConfig({
            preset: 'agentChat',
            provider: 'openai'
        });

        expect(config.provider).toBe('openai');
        expect(config.modelKey).toBe('openai:gpt-5.4');
        expect(config.reasoningEffort).toBe('medium');
        expect(config.maxOutputTokens).toBe(8_000);
        expect(config.useToolCalling).toBe(true);
        expect(config.parallelToolCalls).toBe(true);
        expect(config.toolChoice).toBe('auto');
        expect(config.warnings).toEqual([]);
    });

    it('caps requested output tokens to the model maximum', () => {
        const config = resolveAiRequestConfig({
            preset: 'titleGeneration',
            provider: 'openai',
            maxOutputTokens: 200_000
        });

        expect(config.modelKey).toBe('openai:gpt-5.4-nano');
        expect(config.requestedMaxOutputTokens).toBe(200_000);
        expect(config.maxOutputTokens).toBe(128_000);
        expect(config.warnings.some((warning) => warning.includes('capped'))).toBe(true);
    });

    it('keeps anthropic thinking defaults on models that advertise extended-thinking support', () => {
        const config = resolveAiRequestConfig({
            preset: 'analysis',
            model: 'anthropic:claude-sonnet-4-6'
        });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe('anthropic:claude-sonnet-4-6');
        expect(config.reasoningEffort).toBeNull();
        expect(config.anthropicThinkingBudgetTokens).toBe(2_048);
        expect(config.warnings.some((warning) => warning.includes('Reasoning effort was cleared'))).toBe(true);
    });

    it('prefers openai automatically for deep-research presets', () => {
        const config = resolveAiRequestConfig({
            preset: 'deepResearch'
        });

        expect(config.provider).toBe('openai');
        expect(config.modelKey).toBe('openai:o3-deep-research');
        expect(config.useBuiltInWebSearch).toBe(true);
        expect(config.builtInWebSearchContextSize).toBe('high');
    });

    it('supports explicit model overrides that are not yet in the shared catalog', () => {
        const config = resolveAiRequestConfig({
            preset: 'structuredExtraction',
            model: 'openai:gpt-5.4-experimental'
        });

        expect(config.provider).toBe('openai');
        expect(config.catalogEntry).toBeNull();
        expect(config.modelKey).toBe('openai:gpt-5.4-experimental');
        expect(config.modelId).toBe('gpt-5.4-experimental');
        expect(config.maxOutputTokens).toBe(2_000);
        expect(config.warnings.some((warning) => warning.includes('not found in the shared catalog'))).toBe(true);
    });

    it('lists presets and can filter by tags', () => {
        expect(listAiRequestPresets().length).toBeGreaterThanOrEqual(10);

        const structuredPresets = listAiRequestPresets({ tags: ['structured'] }).map((preset) => preset.key);
        expect(structuredPresets).toEqual(expect.arrayContaining(['classification', 'structuredExtraction', 'visionExtraction']));
        expect(structuredPresets).not.toContain('agentChat');
    });
});
