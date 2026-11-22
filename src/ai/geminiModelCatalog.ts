import type { AiInputModality, AiModelCapabilities, AiModelCatalogEntry, AiOutputModality } from './aiModelTypes.js';

const GEMINI_VERIFIED_AT = '2026-11-16';
const GEMINI_NEON_VERIFIED_AT = '2026-11-21';

const geminiSource = (label: string, path: string, verifiedAt = GEMINI_VERIFIED_AT) => ({
    label,
    url: `https://aistudio.google.com/docs/${path}`,
    verifiedAt
});

const createGeminiModel = (params: {
    modelId: string;
    displayName: string;
    family: string;
    description: string;
    reasoningEffortLevels?: AiModelCapabilities['reasoningEffortLevels'];
    replacementModelId?: string;
    inputPrice: number;
    cachedInputPrice: number;
    outputPrice: number;
    pricingNotes?: string;
    supportsComputerUse?: boolean;
    temperaturePolicy?: NonNullable<AiModelCatalogEntry['parameterPolicies']>['temperature'];
    verifiedAt?: string;
}): AiModelCatalogEntry<'google'> => ({
    modelKey: `google:${params.modelId}`,
    provider: 'google',
    modelId: params.modelId,
    snapshotModelId: null,
    aliases: [`models/${params.modelId}`],
    displayName: params.displayName,
    family: params.family,
    description: params.description,
    status: params.replacementModelId ? 'deprecated' : 'active',
    recommendedReplacementModelKey: params.replacementModelId ? `google:${params.replacementModelId}` : null,
    inputModalities: ['text', 'image', 'audio', 'video'],
    outputModalities: ['text'],
    capabilities: {
        supportsTextInput: true,
        supportsTextOutput: true,
        supportsImageInput: true,
        supportsAudioInput: true,
        supportsAudioOutput: false,
        supportsVision: true,
        supportsStreaming: true,
        supportsToolCalling: true,
        supportsStructuredOutputs: true,
        supportsPromptCaching: true,
        supportsWebSearch: true,
        supportsFileSearch: true,
        supportsComputerUse: params.supportsComputerUse ?? null,
        supportsMcp: null,
        supportsReasoningEffort: params.reasoningEffortLevels ? true : null,
        reasoningEffortLevels: params.reasoningEffortLevels ?? [],
        supportsExtendedThinking: null,
        supportsAdaptiveThinking: null
    },
    contextWindowTokens: 1_048_576,
    maxOutputTokens: 65_536,
    knowledgeCutoff: null,
    pricing: {
        inputUsdPerMillionTokens: params.inputPrice,
        cachedInputUsdPerMillionTokens: params.cachedInputPrice,
        outputUsdPerMillionTokens: params.outputPrice,
        cacheWrite5mUsdPerMillionTokens: null,
        cacheWrite1hUsdPerMillionTokens: null,
        longContextThresholdInputTokens: null,
        longContextInputUsdPerMillionTokens: null,
        longContextCachedInputUsdPerMillionTokens: null,
        longContextOutputUsdPerMillionTokens: null,
        notes: params.pricingNotes ?? null
    },
    sources: [
        geminiSource('Google Gemini model documentation', `models/${params.modelId}`, params.verifiedAt),
        geminiSource('Google Gemini pricing', `pricing#${params.modelId}`, params.verifiedAt),
        params.replacementModelId
            ? geminiSource('Google Gemini deprecations', 'deprecations', params.verifiedAt)
            : geminiSource('Google Gemini video understanding', 'video-understanding', params.verifiedAt)
    ],
    tags: ['multimodal', 'video-understanding'],
    parameterPolicies: { temperature: params.temperaturePolicy ?? 'unsupported' }
});

const createGeminiMediaModel = (params: {
    modelId: string;
    displayName: string;
    family: string;
    description: string;
    inputModalities: readonly AiInputModality[];
    outputModalities: readonly AiOutputModality[];
    contextWindowTokens: number;
    maxOutputTokens: number;
    inputPrice: number;
    textOutputPrice?: number;
    pricingNotes: string;
    capabilities?: Partial<AiModelCapabilities>;
    modelPage?: string;
    pricingAnchor?: string;
    replacementModelId?: string;
}): AiModelCatalogEntry<'google'> => ({
    modelKey: `google:${params.modelId}`,
    provider: 'google',
    modelId: params.modelId,
    snapshotModelId: null,
    aliases: [`models/${params.modelId}`],
    displayName: params.displayName,
    family: params.family,
    description: params.description,
    status: params.replacementModelId ? 'deprecated' : 'specialized',
    recommendedReplacementModelKey: params.replacementModelId ? `google:${params.replacementModelId}` : null,
    inputModalities: params.inputModalities,
    outputModalities: params.outputModalities,
    capabilities: {
        supportsTextInput: params.inputModalities.includes('text'),
        supportsTextOutput: params.outputModalities.includes('text'),
        supportsImageInput: params.inputModalities.includes('image'),
        supportsAudioInput: params.inputModalities.includes('audio'),
        supportsAudioOutput: params.outputModalities.includes('audio'),
        supportsVision: params.inputModalities.includes('image') || params.inputModalities.includes('video'),
        supportsStreaming: null,
        supportsToolCalling: null,
        supportsStructuredOutputs: null,
        supportsPromptCaching: null,
        supportsWebSearch: null,
        supportsFileSearch: null,
        supportsComputerUse: null,
        supportsMcp: null,
        supportsReasoningEffort: null,
        reasoningEffortLevels: [],
        supportsExtendedThinking: null,
        supportsAdaptiveThinking: null,
        ...params.capabilities
    },
    contextWindowTokens: params.contextWindowTokens,
    maxOutputTokens: params.maxOutputTokens,
    knowledgeCutoff: null,
    pricing: {
        inputUsdPerMillionTokens: params.inputPrice,
        cachedInputUsdPerMillionTokens: null,
        outputUsdPerMillionTokens: params.textOutputPrice ?? null,
        cacheWrite5mUsdPerMillionTokens: null,
        cacheWrite1hUsdPerMillionTokens: null,
        longContextThresholdInputTokens: null,
        longContextInputUsdPerMillionTokens: null,
        longContextCachedInputUsdPerMillionTokens: null,
        longContextOutputUsdPerMillionTokens: null,
        notes: params.pricingNotes
    },
    sources: [
        geminiSource('Google Gemini model documentation', `models/${params.modelPage ?? params.modelId}`),
        geminiSource('Google Gemini pricing', `pricing#${params.pricingAnchor ?? params.modelId}`),
        ...(params.replacementModelId ? [geminiSource('Google Gemini deprecations', 'deprecations')] : [])
    ],
    tags: [params.family]
});

const imageCapabilities = {
    supportsToolCalling: false,
    supportsStructuredOutputs: false,
    supportsPromptCaching: false,
    supportsWebSearch: true,
    supportsFileSearch: false,
    supportsComputerUse: false
};

const ttsCapabilities = {
    supportsStreaming: null,
    supportsToolCalling: false,
    supportsStructuredOutputs: false,
    supportsPromptCaching: false,
    supportsWebSearch: false,
    supportsFileSearch: false,
    supportsComputerUse: false,
    supportsReasoningEffort: false
};

const liveCapabilities = {
    supportsStreaming: true,
    supportsToolCalling: true,
    supportsStructuredOutputs: false,
    supportsPromptCaching: false,
    supportsWebSearch: true,
    supportsFileSearch: false,
    supportsComputerUse: false
};

const flashPromotionalPricing =
    'Introductory rates run through December 31, 2026. Standard input, cached input, and output rates are $1.50, $0.15, and $7.50 from January 1, 2027.';

const gemini4PromotionalPricing =
    'Introductory rates run through November 30, 2026. Standard input, cached input, and output rates are $4, $0.20, and $20 from December 1. Long decode supports up to 1,048,576 output tokens. The catalog limit is for synchronous requests.';

export const GEMINI_MODEL_CATALOG: readonly AiModelCatalogEntry<'google'>[] = [
    createGeminiModel({
        modelId: 'gemini-4-hydrogen',
        displayName: 'Gemini 4 Hydrogen',
        family: 'gemini-4',
        description: 'Efficient multimodal model for coding, video understanding, and everyday agentic work.',
        reasoningEffortLevels: ['low', 'medium', 'high', 'xhigh'],
        supportsComputerUse: true,
        inputPrice: 1.5,
        cachedInputPrice: 0.075,
        outputPrice: 7.5,
        pricingNotes: 'Long decode supports up to 1,048,576 output tokens. The catalog limit is for synchronous requests.'
    }),
    createGeminiModel({
        modelId: 'gemini-4-carbon',
        displayName: 'Gemini 4 Carbon',
        family: 'gemini-4',
        description: 'Google’s most capable Gemini 4 reasoning model for complex and multimodal work.',
        reasoningEffortLevels: ['low', 'medium', 'high', 'xhigh'],
        supportsComputerUse: true,
        inputPrice: 2,
        cachedInputPrice: 0.1,
        outputPrice: 10,
        pricingNotes: gemini4PromotionalPricing
    }),
    createGeminiModel({
        modelId: 'gemini-4-argon',
        displayName: 'Gemini 4 Argon',
        family: 'gemini-4',
        description: 'Efficient frontier reasoning for complex coding and multimodal tasks.',
        reasoningEffortLevels: ['low', 'medium', 'high'],
        supportsComputerUse: true,
        inputPrice: 2,
        cachedInputPrice: 0.1,
        outputPrice: 10,
        pricingNotes: gemini4PromotionalPricing
    }),
    createGeminiModel({
        modelId: 'gemini-4-neon',
        displayName: 'Gemini 4 Neon',
        family: 'gemini-4',
        description: 'High-speed Gemini 4 reasoning model for low-latency, deep-context multimodal work.',
        reasoningEffortLevels: ['low', 'medium', 'high', 'xhigh'],
        supportsComputerUse: true,
        inputPrice: 3,
        cachedInputPrice: 0.15,
        outputPrice: 15,
        pricingNotes: 'Long decode supports up to 1,048,576 output tokens. The catalog limit is for synchronous requests.',
        verifiedAt: GEMINI_NEON_VERIFIED_AT
    }),
    createGeminiModel({
        modelId: 'gemini-3.8-flash',
        displayName: 'Gemini 3.8 Flash',
        family: 'gemini-3',
        description: 'Previous-generation Flash model with multimodal input.',
        reasoningEffortLevels: ['low', 'medium', 'high'],
        supportsComputerUse: true,
        inputPrice: 0.75,
        cachedInputPrice: 0.075,
        outputPrice: 3.75,
        pricingNotes: flashPromotionalPricing
    }),
    createGeminiModel({
        modelId: 'gemini-3.6-flash',
        displayName: 'Gemini 3.6 Flash',
        family: 'gemini-3',
        description: 'Multimodal Flash model with agentic video understanding.',
        supportsComputerUse: true,
        inputPrice: 0.75,
        cachedInputPrice: 0.075,
        outputPrice: 3.75,
        pricingNotes: flashPromotionalPricing
    }),
    createGeminiModel({
        modelId: 'gemini-3.5-flash-lite',
        displayName: 'Gemini 3.5 Flash-Lite',
        family: 'gemini-3',
        description: 'Low-cost multimodal model for high-throughput extraction and processing.',
        reasoningEffortLevels: ['minimal', 'medium', 'high'],
        supportsComputerUse: true,
        inputPrice: 0.3,
        cachedInputPrice: 0.03,
        outputPrice: 2.5
    }),
    createGeminiModel({
        modelId: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        family: 'gemini-2.5',
        description: 'Deprecated multimodal Flash model.',
        replacementModelId: 'gemini-3.5-flash-lite',
        temperaturePolicy: 'supported',
        inputPrice: 0.3,
        cachedInputPrice: 0.03,
        outputPrice: 2.5,
        pricingNotes:
            'Audio input is $1 and cached audio is $0.10 per million tokens. From December 1, 2026, requests route to Flash-Lite at its rates.'
    }),
    createGeminiMediaModel({
        modelId: 'gemini-nano-banana-2.1',
        displayName: 'Nano Banana 2.1',
        family: 'image-generation',
        description: 'Image generation and conversational editing with Google Search grounding.',
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['text', 'image'],
        contextWindowTokens: 131_072,
        maxOutputTokens: 32_768,
        inputPrice: 1.5,
        textOutputPrice: 7.5,
        pricingNotes:
            'Text, image, and video input share the same price. Image output is $30 per million tokens, or $0.0336 per 1024×1024 image.',
        capabilities: imageCapabilities
    }),
    createGeminiMediaModel({
        modelId: 'gemini-3-pro-image',
        displayName: 'Gemini 3 Pro Image',
        family: 'image-generation',
        description: 'High-fidelity image generation and editing from text and reference images.',
        inputModalities: ['text', 'image'],
        outputModalities: ['text', 'image'],
        contextWindowTokens: 65_536,
        maxOutputTokens: 32_768,
        inputPrice: 2,
        textOutputPrice: 12,
        pricingNotes: 'Text and image input share the same price. Image output is $120 per million tokens, or $0.134 per 1K or 2K image.',
        capabilities: imageCapabilities
    }),
    createGeminiMediaModel({
        modelId: 'gemini-3.1-flash-image',
        displayName: 'Gemini 3.1 Flash Image',
        family: 'image-generation',
        description: 'Flash image generation and editing, also known as Nano Banana 2.',
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['text', 'image'],
        contextWindowTokens: 131_072,
        maxOutputTokens: 32_768,
        inputPrice: 0.5,
        textOutputPrice: 3,
        pricingNotes:
            'The listed input rate is for text and images. Image output is $60 per million tokens, or $0.067 per 1024×1024 image.',
        capabilities: imageCapabilities
    }),
    createGeminiMediaModel({
        modelId: 'gemini-3.1-flash-lite-image',
        displayName: 'Gemini 3.1 Flash-Lite Image',
        family: 'image-generation',
        description: 'Low-cost image generation and editing, also known as Nano Banana 2 Lite.',
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['text', 'image'],
        contextWindowTokens: 65_536,
        maxOutputTokens: 4_096,
        inputPrice: 0.25,
        textOutputPrice: 1.5,
        pricingNotes:
            'Text, image, and video input share the same price. Image output is $30 per million tokens, or $0.0336 per 1024×1024 image.',
        capabilities: { ...imageCapabilities, supportsWebSearch: false }
    }),
    createGeminiMediaModel({
        modelId: 'gemini-3.8-flash-tts',
        displayName: 'Gemini 3.8 Flash TTS',
        family: 'text-to-speech',
        description: 'Expressive single-speaker and multi-speaker speech synthesis.',
        inputModalities: ['text'],
        outputModalities: ['audio'],
        contextWindowTokens: 8_192,
        maxOutputTokens: 16_384,
        inputPrice: 0.5,
        pricingNotes: 'Audio output is $9 per million tokens. Text input and audio output rise to $1 and $18 on January 1, 2027.',
        capabilities: ttsCapabilities
    }),
    createGeminiMediaModel({
        modelId: 'gemini-3.8-flash-lite-tts',
        displayName: 'Gemini 3.8 Flash-Lite TTS',
        family: 'text-to-speech',
        description: 'Lower-cost single-speaker and multi-speaker speech synthesis.',
        inputModalities: ['text'],
        outputModalities: ['audio'],
        contextWindowTokens: 8_192,
        maxOutputTokens: 16_384,
        inputPrice: 0.5,
        pricingNotes: 'Audio output is $6 per million tokens. Text input and audio output rise to $1 and $12 on January 1, 2027.',
        capabilities: ttsCapabilities
    }),
    ...(['gemini-3.8-live', 'gemini-3.8-live-extended-thinking'] as const).map((modelId) =>
        createGeminiMediaModel({
            modelId,
            displayName: modelId === 'gemini-3.8-live' ? 'Gemini 3.8 Live' : 'Gemini 3.8 Live Extended Thinking',
            family: 'live-audio',
            description: 'Bidirectional audio and text streaming through the Gemini Live API.',
            inputModalities: ['text', 'image', 'audio'],
            outputModalities: ['text', 'audio'],
            contextWindowTokens: 131_072,
            maxOutputTokens: 65_536,
            inputPrice: 0.75,
            textOutputPrice: 4.5,
            pricingNotes:
                'Per million tokens, input is $0.75 for text, $3 for audio, and $1 for image/video. Output is $4.50 for text and $12 for audio.',
            pricingAnchor: 'gemini-3.8-live',
            capabilities: liveCapabilities
        })
    ),
    createGeminiMediaModel({
        modelId: 'gemini-omni-1.2-flash',
        displayName: 'Gemini Omni 1.2 Flash',
        family: 'video-generation',
        description: 'Video generation and conversational editing with native audio through the Interactions API.',
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['text', 'video', 'audio'],
        contextWindowTokens: 131_072,
        maxOutputTokens: 65_536,
        inputPrice: 1.5,
        textOutputPrice: 9,
        pricingNotes: 'Video output is $12 per million tokens (about $0.07 per second at 720p). Audio is part of the generated video.',
        modelPage: 'gemini-omni-flash'
    }),
    createGeminiMediaModel({
        modelId: 'gemini-omni-1.1-flash',
        displayName: 'Gemini Omni 1.1 Flash',
        family: 'video-generation',
        description: 'Previous-generation video generation and editing model.',
        inputModalities: ['text', 'image', 'video'],
        outputModalities: ['video'],
        contextWindowTokens: 131_072,
        maxOutputTokens: 65_536,
        inputPrice: 1.5,
        pricingNotes: 'Video output is $17.50 per million tokens. From December 3, 2026, requests route to Omni 1.2 Flash at its rates.',
        modelPage: 'gemini-omni-flash',
        replacementModelId: 'gemini-omni-1.2-flash'
    })
] as const;
