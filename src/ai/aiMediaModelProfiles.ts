import { getAiModelById, getAiModelByKey, resolveCurrentAiCatalogModel } from './aiModelSelectors.js';
import { GEMINI_MODEL_CATALOG } from './geminiModelCatalog.js';

export const AI_MEDIA_MODEL_PROFILES = {
    imageGeneration: 'openai:gpt-image-2.6-flare',
    videoExtraction: 'google:gemini-4-hydrogen'
} as const;

export type AiMediaModelProfile = keyof typeof AI_MEDIA_MODEL_PROFILES;

export function resolveAiMediaModelId(params: { profile: AiMediaModelProfile; model?: string | null }): string {
    const defaultKey = AI_MEDIA_MODEL_PROFILES[params.profile];
    const provider = params.profile === 'imageGeneration' ? 'openai' : 'google';
    const override = params.model?.trim() || null;
    const modelId =
        override
            ?.replace(new RegExp(`^${provider}:`, 'i'), '')
            .replace(/^models\//, '')
            .trim() || null;

    if (override && (!modelId || modelId.includes(':'))) {
        throw new Error(`Invalid ${provider} model override "${override}" for ${params.profile}.`);
    }

    if (params.profile === 'imageGeneration') {
        const model = modelId ? getAiModelById(modelId, 'openai') : getAiModelByKey(defaultKey);
        if (!model && modelId) return modelId;
        if (!model) throw new Error(`Missing shared model "${defaultKey}".`);

        const resolved = resolveCurrentAiCatalogModel(model, getAiModelByKey);
        if (!resolved.outputModalities.includes('image')) {
            throw new Error(`AI model "${resolved.modelKey}" does not support image output.`);
        }

        return resolved.modelId;
    }

    const findGeminiModel = (key: string) => GEMINI_MODEL_CATALOG.find((model) => model.modelKey === key) ?? null;
    const model = findGeminiModel(modelId ? `google:${modelId}` : defaultKey);
    if (!model && modelId) return modelId;
    if (!model) throw new Error(`Missing shared model "${defaultKey}".`);

    return resolveCurrentAiCatalogModel(model, findGeminiModel).modelId;
}
