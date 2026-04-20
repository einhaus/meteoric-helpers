import type { AiReasoningEffort } from './aiModelTypes.js';

export type AiInferenceProfileKey =
    | 'reasoning_none'
    | 'reasoning_low'
    | 'reasoning_medium'
    | 'reasoning_high'
    | 'reasoning_xhigh';

export type AiInferenceProfileDefinition = Readonly<{
    key: AiInferenceProfileKey;
    displayName: string;
    description: string;
    sortOrder: number;
    reasoningEffort: AiReasoningEffort;
    anthropicThinkingBudgetTokens: number | null;
}>;

export type SerializedAiInferenceProfile = Readonly<{
    normalizedJson: string;
    openaiParamsJson: string | null;
    anthropicParamsJson: string | null;
}>;

const createInferenceProfile = (profile: AiInferenceProfileDefinition): AiInferenceProfileDefinition => profile;

export const AI_INFERENCE_PROFILES: readonly AiInferenceProfileDefinition[] = [
    createInferenceProfile({
        key: 'reasoning_none',
        displayName: 'Reasoning: None',
        description: 'Fastest; minimizes deliberate reasoning.',
        sortOrder: 10,
        reasoningEffort: 'none',
        anthropicThinkingBudgetTokens: null
    }),
    createInferenceProfile({
        key: 'reasoning_low',
        displayName: 'Reasoning: Low',
        description: 'More careful than None; still fast.',
        sortOrder: 20,
        reasoningEffort: 'low',
        anthropicThinkingBudgetTokens: 1_024
    }),
    createInferenceProfile({
        key: 'reasoning_medium',
        displayName: 'Reasoning: Medium',
        description: 'Balanced quality and speed.',
        sortOrder: 30,
        reasoningEffort: 'medium',
        anthropicThinkingBudgetTokens: 2_048
    }),
    createInferenceProfile({
        key: 'reasoning_high',
        displayName: 'Reasoning: High',
        description: 'Slower; improves multi-step work.',
        sortOrder: 40,
        reasoningEffort: 'high',
        anthropicThinkingBudgetTokens: 4_096
    }),
    createInferenceProfile({
        key: 'reasoning_xhigh',
        displayName: 'Reasoning: XHigh',
        description: 'Slowest; strongest reasoning for complex tasks.',
        sortOrder: 50,
        reasoningEffort: 'xhigh',
        anthropicThinkingBudgetTokens: 8_192
    })
] as const;

const AI_INFERENCE_PROFILES_BY_KEY = new Map(AI_INFERENCE_PROFILES.map((profile) => [profile.key, profile]));

export function listAiInferenceProfiles(): AiInferenceProfileDefinition[] {
    return [...AI_INFERENCE_PROFILES];
}

export function getAiInferenceProfile(key: AiInferenceProfileKey): AiInferenceProfileDefinition | null {
    return AI_INFERENCE_PROFILES_BY_KEY.get(key) ?? null;
}

export function serializeAiInferenceProfile(profile: AiInferenceProfileDefinition): SerializedAiInferenceProfile {
    return {
        normalizedJson: JSON.stringify({
            reasoningEffort: profile.reasoningEffort
        }),
        openaiParamsJson: JSON.stringify({
            reasoning_effort: profile.reasoningEffort
        }),
        anthropicParamsJson:
            profile.anthropicThinkingBudgetTokens === null
                ? null
                : JSON.stringify({
                      thinking: {
                          type: 'enabled',
                          budget_tokens: profile.anthropicThinkingBudgetTokens
                      }
                  })
    };
}
