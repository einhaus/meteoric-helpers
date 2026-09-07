import { describe, expect, it } from 'vitest';
import { listAiRequestPresets, resolveAiRequestConfig } from '../../src/ai/aiRequestSelectors.js';

describe('AI request preset helpers', () => {
    it('resolves openai agent chat defaults from the shared preset catalog', () => {
        const config = resolveAiRequestConfig({
            preset: 'agentChat',
            provider: 'openai'
        });

        expect(config.provider).toBe('openai');
        expect(config.modelKey).toBe('openai:gpt-5.6-terra');
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

        expect(config.modelKey).toBe('openai:gpt-5.6-luna');
        expect(config.inferenceProfileKey).toBe('reasoning_none');
        expect(config.requestedMaxOutputTokens).toBe(200_000);
        expect(config.maxOutputTokens).toBe(128_000);
        expect(config.warnings.some((warning) => warning.includes('capped'))).toBe(true);
    });

    it('automatically upgrades legacy Anthropic overrides before applying inference defaults', () => {
        const config = resolveAiRequestConfig({
            preset: 'analysis',
            model: 'anthropic:claude-sonnet-4-6'
        });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe('anthropic:claude-sonnet-5');
        expect(config.inferenceProfileKey).toBe('reasoning_medium');
        expect(config.reasoningEffort).toBeNull();
        expect(config.anthropicThinkingBudgetTokens).toBeNull();
        expect(config.warnings.some((warning) => warning.includes('was automatically upgraded'))).toBe(true);
    });

    it.each([
        ['claude-opus-4-5', 'anthropic:claude-opus-5'],
        ['claude-sonnet-4-5', 'anthropic:claude-sonnet-5']
    ])('upgrades explicit legacy %s requests to %s', (model, expectedModelKey) => {
        const config = resolveAiRequestConfig({ preset: 'analysis', model, maxOutputTokens: 100_000 });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe(expectedModelKey);
        expect(config.requestedMaxOutputTokens).toBe(100_000);
        expect(config.maxOutputTokens).toBe(100_000);
        expect(config.warnings.some((warning) => warning.includes('was automatically upgraded'))).toBe(true);
    });

    it('upgrades a legacy OpenAI request before snapshot selection', () => {
        const config = resolveAiRequestConfig({ preset: 'analysis', model: 'gpt-4o', preferSnapshot: true });

        expect(config.modelKey).toBe('openai:gpt-5.6-sol');
        expect(config.modelId).toBe('gpt-5.6-sol');
        expect(config.warnings.some((warning) => warning.includes('was automatically upgraded'))).toBe(true);
    });

    it('supports explicit adaptive-only Anthropic reasoning models without adding legacy thinking budgets', () => {
        const config = resolveAiRequestConfig({
            preset: 'agentChat',
            model: 'anthropic:claude-fable-5-1'
        });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe('anthropic:claude-fable-5-1');
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

    it('applies current-model temperature policy after upgrading a legacy Anthropic override', () => {
        const config = resolveAiRequestConfig({
            preset: 'analysis',
            model: 'anthropic:claude-sonnet-4-6',
            temperature: 0.2
        });

        expect(config.provider).toBe('anthropic');
        expect(config.modelKey).toBe('anthropic:claude-sonnet-5');
        expect(config.anthropicThinkingBudgetTokens).toBeNull();
        expect(config.temperature).toBeNull();
        expect(config.warnings.some((warning) => warning.includes('does not support the temperature parameter'))).toBe(true);
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
        expect(config.modelKey).toBe('openai:gpt-5.6-terra');
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

        expect(config.modelKey).toBe('openai:gpt-5.6-terra');
        expect(config.inferenceProfileKey).toBe('reasoning_medium');
        expect(config.temperature).toBeNull();
        expect(config.warnings.some((warning) => warning.includes('does not support the temperature parameter'))).toBe(true);
    });

    it('supports explicit GPT-6 Astra requests without changing the cost-gated defaults', () => {
        const config = resolveAiRequestConfig({
            preset: 'agentChat',
            model: 'openai:gpt-6-astra',
            temperature: 0.35
        });

        expect(config.provider).toBe('openai');
        expect(config.modelKey).toBe('openai:gpt-6-astra');
        expect(config.reasoningEffort).toBe('high');
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
        expect(config.modelKey).toBe('openai:gpt-5.6-luna');
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
        expect(config.modelKey).toBe('openai:gpt-5.6-terra');
        expect(config.inferenceProfileKey).toBe('reasoning_high');
        expect(config.reasoningEffort).toBe('high');
        expect(config.overridesApplied).toContain('inferenceProfileKey');
    });

    it('follows multi-hop replacements until a current model is reached', () => {
        const config = resolveAiRequestConfig({
            preset: 'titleGeneration',
            model: 'openai:chatgpt-4o-latest',
            temperature: 0.35
        });

        expect(config.modelKey).toBe('openai:gpt-5.6-sol');
        expect(config.reasoningEffort).toBe('none');
        expect(config.temperature).toBeNull();
        expect(config.warnings).toContain(
            'Outdated model "openai:chatgpt-4o-latest" (retired) was automatically upgraded: openai:chatgpt-4o-latest -> openai:gpt-5.1-chat-latest -> openai:gpt-5.6-sol.'
        );
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
