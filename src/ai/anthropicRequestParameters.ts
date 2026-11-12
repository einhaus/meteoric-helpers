import type { AiReasoningEffort } from './aiModelTypes.js';
import type { AiResolvedRequestConfig } from './aiRequestTypes.js';

export type AnthropicTextRequestParameters = Readonly<{
    model: string;
    max_tokens: number;
    output_config?: { effort: AiReasoningEffort };
    thinking?: { type: 'adaptive' } | { type: 'enabled'; budget_tokens: number };
    temperature?: number;
}>;

/** Build the model-dependent portion of a Messages request from validated shared settings. */
export function buildAnthropicTextRequestParameters(config: AiResolvedRequestConfig): AnthropicTextRequestParameters {
    if (config.provider !== 'anthropic') {
        throw new Error(`Expected an Anthropic request configuration, received "${config.provider}".`);
    }
    if (config.maxOutputTokens === null || !Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens <= 0) {
        throw new Error(`Anthropic model "${config.modelId}" requires a positive integer max output token limit.`);
    }

    const capabilities = config.catalogEntry?.capabilities;
    const shouldUseAdaptiveThinking =
        capabilities?.requiresAdaptiveThinking === true ||
        (capabilities?.supportsAdaptiveThinking === true &&
            (config.reasoningEffort !== null || config.anthropicThinkingBudgetTokens !== null));
    let thinking: AnthropicTextRequestParameters['thinking'];
    if (shouldUseAdaptiveThinking) {
        thinking = { type: 'adaptive' };
    } else if (config.anthropicThinkingBudgetTokens !== null) {
        if (
            !Number.isSafeInteger(config.anthropicThinkingBudgetTokens) ||
            config.anthropicThinkingBudgetTokens < 1024 ||
            config.anthropicThinkingBudgetTokens >= config.maxOutputTokens
        ) {
            throw new Error(`Anthropic model "${config.modelId}" requires a thinking budget of at least 1024 and below max output tokens.`);
        }
        thinking = { type: 'enabled', budget_tokens: config.anthropicThinkingBudgetTokens };
    }

    return {
        model: config.modelId,
        max_tokens: config.maxOutputTokens,
        ...(config.reasoningEffort !== null ? { output_config: { effort: config.reasoningEffort } } : {}),
        ...(thinking ? { thinking } : {}),
        ...(config.temperature !== null && !thinking ? { temperature: config.temperature } : {})
    };
}
