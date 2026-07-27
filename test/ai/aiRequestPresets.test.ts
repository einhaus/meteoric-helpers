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
        expect(config.inferenceProfileKey).toBe('reasoning_high');
        expect(config.reasoningEffort).toBe('high');
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
        expect(config.inferenceProfileKey).toBe('reasoning_none');
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
        expect(config.inferenceProfileKey).toBe('reasoning_medium');
        expect(config.reasoningEffort).toBeNull();
        expect(config.anthropicThinkingBudgetTokens).toBe(2_048);
        expect(config.warnings.some((warning) => warning.includes('Reasoning effort was cleared'))).toBe(false);
    });

    it('supports explicit adaptive-only Anthropic reasoning models without adding legacy thinking budgets', () => {
        const config = resolveAiRequestConfig({
            preset: 'agentChat',
            model: 'anthropic:claude-fable-5'
        });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe('anthropic:claude-fable-5');
        expect(config.inferenceProfileKey).toBe('reasoning_high');
        expect(config.anthropicThinkingBudgetTokens).toBeNull();
        expect(config.warnings.some((warning) => warning.includes('does not advertise extended-thinking support'))).toBe(false);
    });

    it('uses Claude Opus 5 as the cost-gated Anthropic reasoning default', () => {
        const config = resolveAiRequestConfig({
            preset: 'agentChat',
            provider: 'anthropic'
        });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe('anthropic:claude-opus-5');
        expect(config.inferenceProfileKey).toBe('reasoning_high');
        expect(config.anthropicThinkingBudgetTokens).toBeNull();
        expect(config.temperature).toBeNull();
    });

    it('uses the Anthropic Sonnet 5 balanced default without legacy thinking budgets', () => {
        const config = resolveAiRequestConfig({
            preset: 'analysis',
            provider: 'anthropic'
        });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe('anthropic:claude-sonnet-5');
        expect(config.inferenceProfileKey).toBe('reasoning_medium');
        expect(config.anthropicThinkingBudgetTokens).toBeNull();
        expect(config.temperature).toBeNull();
        expect(config.warnings.some((warning) => warning.includes('does not support the temperature parameter'))).toBe(true);
    });

    it('clears anthropic temperature automatically when a thinking budget is active', () => {
        const config = resolveAiRequestConfig({
            preset: 'analysis',
            model: 'anthropic:claude-sonnet-4-6',
            temperature: 0.2
        });

        expect(config.provider).toBe('anthropic');
        expect(config.anthropicThinkingBudgetTokens).toBe(2_048);
        expect(config.temperature).toBeNull();
        expect(config.warnings.some((warning) => warning.includes('Anthropic thinking budgets are incompatible'))).toBe(true);
    });

    it('prefers openai automatically for deep-research presets', () => {
        const config = resolveAiRequestConfig({
            preset: 'deepResearch'
        });

        expect(config.provider).toBe('openai');
        expect(config.modelKey).toBe('openai:gpt-5.6-sol');
        expect(config.inferenceProfileKey).toBe('reasoning_high');
        expect(config.maxOutputTokens).toBe(100_000);
        expect(config.useBuiltInWebSearch).toBe(true);
        expect(config.builtInWebSearchContextSize).toBe('high');
    });

    it('resolves creative-writing presets to the shared balanced profile without a default temperature', () => {
        const config = resolveAiRequestConfig({
            preset: 'creativeWriting',
            provider: 'openai'
        });

        expect(config.provider).toBe('openai');
        expect(config.modelKey).toBe('openai:gpt-5.4');
        expect(config.inferenceProfileKey).toBe('reasoning_medium');
        expect(config.reasoningEffort).toBe('medium');
        expect(config.temperature).toBeNull();
        expect(config.maxOutputTokens).toBe(6_000);
    });

    it('clears temperature automatically for GPT-5-family models that do not support it', () => {
        const config = resolveAiRequestConfig({
            preset: 'creativeWriting',
            provider: 'openai',
            temperature: 0.35
        });

        expect(config.modelKey).toBe('openai:gpt-5.4');
        expect(config.inferenceProfileKey).toBe('reasoning_medium');
        expect(config.temperature).toBeNull();
        expect(config.warnings.some((warning) => warning.includes('does not support the temperature parameter'))).toBe(true);
    });

    it('lets model-profile selection control both model and default reasoning', () => {
        const config = resolveAiRequestConfig({
            preset: 'agentChat',
            provider: 'openai',
            modelProfile: 'fast'
        });

        expect(config.modelProfile).toBe('fast');
        expect(config.modelKey).toBe('openai:gpt-5.4-mini');
        expect(config.inferenceProfileKey).toBe('reasoning_low');
        expect(config.reasoningEffort).toBe('low');
        expect(config.overridesApplied).toContain('modelProfile');
    });

    it('supports inference-profile overrides independently from model-profile selection', () => {
        const config = resolveAiRequestConfig({
            preset: 'structuredExtraction',
            provider: 'openai',
            inferenceProfileKey: 'reasoning_high'
        });

        expect(config.modelProfile).toBe('balanced');
        expect(config.modelKey).toBe('openai:gpt-5.4');
        expect(config.inferenceProfileKey).toBe('reasoning_high');
        expect(config.reasoningEffort).toBe('high');
        expect(config.overridesApplied).toContain('inferenceProfileKey');
    });

    it('keeps temperature on GPT-5.1 only when reasoning effort resolves to none', () => {
        const supportedConfig = resolveAiRequestConfig({
            preset: 'titleGeneration',
            model: 'openai:gpt-5.1',
            temperature: 0.35
        });

        const unsupportedConfig = resolveAiRequestConfig({
            preset: 'creativeWriting',
            model: 'openai:gpt-5.1',
            temperature: 0.35
        });

        expect(supportedConfig.reasoningEffort).toBe('none');
        expect(supportedConfig.temperature).toBe(0.35);
        expect(unsupportedConfig.reasoningEffort).toBe('medium');
        expect(unsupportedConfig.temperature).toBeNull();
        expect(
            unsupportedConfig.warnings.some((warning) =>
                warning.includes('only supports temperature when reasoning effort is set to "none"')
            )
        ).toBe(true);
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
