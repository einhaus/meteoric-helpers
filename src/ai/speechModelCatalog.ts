import type { AiModelSource } from './aiModelTypes.js';
import type { SpeechModelCapabilities, SpeechModelCatalogEntry, SpeechModelPricing } from './speechModelTypes.js';

const VERIFIED_AT = '2026-09-28';

const ELEVENLABS_MODELS_SOURCE: AiModelSource = {
    label: 'ElevenLabs models overview',
    url: 'https://elevenlabs.io/docs/overview/models',
    verifiedAt: VERIFIED_AT
};

const ELEVENLABS_MODELS_API_SOURCE: AiModelSource = {
    label: 'ElevenLabs models API (GET /v1/models: cost multipliers, character limits, languages, settings support)',
    url: 'https://elevenlabs.io/docs/api-reference/models/list',
    verifiedAt: VERIFIED_AT
};

const ELEVENLABS_PRICING_SOURCE: AiModelSource = {
    label: 'ElevenLabs pricing',
    url: 'https://elevenlabs.io/pricing',
    verifiedAt: VERIFIED_AT
};

const ELEVENLABS_V4_SOURCE: AiModelSource = {
    label: 'ElevenLabs Eleven v4 capabilities',
    url: 'https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4',
    verifiedAt: VERIFIED_AT
};

const ELEVENLABS_V4_ANNOUNCEMENT_SOURCE: AiModelSource = {
    label: 'ElevenLabs Eleven v4 announcement',
    url: 'https://elevenlabs.io/blog/eleven-v4',
    verifiedAt: VERIFIED_AT
};

const ELEVENLABS_V4_PROMPTING_SOURCE: AiModelSource = {
    label: 'ElevenLabs Eleven v4 prompting guide',
    url: 'https://elevenlabs.io/docs/best-practices/prompting/eleven-v4',
    verifiedAt: VERIFIED_AT
};

const ELEVENLABS_PRONUNCIATION_DICTIONARIES_SOURCE: AiModelSource = {
    label: 'ElevenLabs pronunciation dictionaries (phoneme support by model)',
    url: 'https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries',
    verifiedAt: VERIFIED_AT
};

const ELEVENLABS_TEXT_TO_SPEECH_SOURCE: AiModelSource = {
    label: 'ElevenLabs text to speech capability overview',
    url: 'https://elevenlabs.io/docs/overview/capabilities/text-to-speech',
    verifiedAt: VERIFIED_AT
};

const createCapabilities = (capabilities: SpeechModelCapabilities): SpeechModelCapabilities => capabilities;
const createPricing = (pricing: SpeechModelPricing): SpeechModelPricing => pricing;

const ELEVENLABS_V4_CAPABILITIES = createCapabilities({
    supportsAudioTags: true,
    supportsStyleSetting: false,
    supportsSpeakerBoostSetting: false,
    supportsSpeedSetting: false,
    supportsSsml: false,
    supportsPronunciationDictionaryPhonemes: true,
    supportsProfessionalVoiceClones: true
});

const ELEVENLABS_V2_GENERATION_CAPABILITIES = createCapabilities({
    supportsAudioTags: false,
    supportsStyleSetting: false,
    supportsSpeakerBoostSetting: false,
    supportsSpeedSetting: true,
    supportsSsml: true,
    supportsPronunciationDictionaryPhonemes: false,
    supportsProfessionalVoiceClones: true
});

const ELEVENLABS_BASE_RATE_PRICING = createPricing({
    characterCostMultiplier: 1,
    notes: 'Billed at the base text-to-speech rate: 1 credit per character.'
});

const ELEVENLABS_HALF_RATE_PRICING = createPricing({
    characterCostMultiplier: 0.5,
    notes: 'Billed at half the base text-to-speech rate: 0.5 credits per character.'
});

export const SPEECH_MODEL_CATALOG: readonly SpeechModelCatalogEntry[] = [
    {
        modelKey: 'elevenlabs:eleven_v4',
        provider: 'elevenlabs',
        modelId: 'eleven_v4',
        aliases: [],
        displayName: 'Eleven v4',
        family: 'eleven_v4',
        description:
            'ElevenLabs’ most expressive text-to-speech model for narration, audiobooks, and character performance. Follows inline audio tags, supports 90+ languages, and keeps speaker identity stable across long-form and regenerated lines.',
        status: 'active',
        recommendedReplacementModelKey: null,
        maxCharactersPerRequest: 10_000,
        languageCount: 85,
        medianLatencyMs: null,
        capabilities: ELEVENLABS_V4_CAPABILITIES,
        pricing: ELEVENLABS_BASE_RATE_PRICING,
        sources: [
            ELEVENLABS_V4_SOURCE,
            ELEVENLABS_V4_ANNOUNCEMENT_SOURCE,
            ELEVENLABS_V4_PROMPTING_SOURCE,
            ELEVENLABS_MODELS_SOURCE,
            ELEVENLABS_MODELS_API_SOURCE,
            ELEVENLABS_PRONUNCIATION_DICTIONARIES_SOURCE,
            ELEVENLABS_PRICING_SOURCE
        ],
        tags: ['flagship', 'narration', 'expressive', 'multilingual', 'audio-tags']
    },
    {
        modelKey: 'elevenlabs:eleven_v4_turbo',
        provider: 'elevenlabs',
        modelId: 'eleven_v4_turbo',
        aliases: [],
        displayName: 'Eleven v4 Turbo',
        family: 'eleven_v4',
        description:
            'Low-latency variant of Eleven v4 for voice agents and real-time playback. Keeps audio-tag control and 90+ languages at roughly 100 ms median inference latency and half the credit cost.',
        status: 'active',
        recommendedReplacementModelKey: null,
        maxCharactersPerRequest: 10_000,
        languageCount: 85,
        medianLatencyMs: 100,
        capabilities: createCapabilities({
            ...ELEVENLABS_V4_CAPABILITIES,
            supportsPronunciationDictionaryPhonemes: null
        }),
        pricing: ELEVENLABS_HALF_RATE_PRICING,
        sources: [
            ELEVENLABS_V4_SOURCE,
            ELEVENLABS_V4_ANNOUNCEMENT_SOURCE,
            ELEVENLABS_MODELS_SOURCE,
            ELEVENLABS_MODELS_API_SOURCE,
            ELEVENLABS_PRICING_SOURCE
        ],
        tags: ['realtime', 'low-latency', 'expressive', 'multilingual', 'audio-tags']
    },
    {
        modelKey: 'elevenlabs:eleven_v3',
        provider: 'elevenlabs',
        modelId: 'eleven_v3',
        aliases: [],
        displayName: 'Eleven v3',
        family: 'eleven_v3',
        description:
            'Previous-generation expressive model with audio tags and 70+ languages. Needs more prompt engineering than v4, caps requests at 5,000 characters, and does not fully support professional voice clones.',
        status: 'legacy',
        recommendedReplacementModelKey: 'elevenlabs:eleven_v4',
        maxCharactersPerRequest: 5_000,
        languageCount: 74,
        medianLatencyMs: null,
        capabilities: createCapabilities({
            supportsAudioTags: true,
            supportsStyleSetting: false,
            supportsSpeakerBoostSetting: false,
            supportsSpeedSetting: null,
            supportsSsml: false,
            supportsPronunciationDictionaryPhonemes: true,
            supportsProfessionalVoiceClones: false
        }),
        pricing: ELEVENLABS_BASE_RATE_PRICING,
        sources: [
            ELEVENLABS_MODELS_SOURCE,
            ELEVENLABS_MODELS_API_SOURCE,
            ELEVENLABS_PRONUNCIATION_DICTIONARIES_SOURCE,
            ELEVENLABS_V4_SOURCE,
            ELEVENLABS_PRICING_SOURCE
        ],
        tags: ['legacy', 'expressive', 'multilingual', 'audio-tags']
    },
    {
        modelKey: 'elevenlabs:eleven_v3_conversational',
        provider: 'elevenlabs',
        modelId: 'eleven_v3_conversational',
        aliases: [],
        displayName: 'Eleven v3 Conversational',
        family: 'eleven_v3',
        description:
            'Previous-generation expressive model tuned for conversational agents at roughly 280 ms latency and half the credit cost. Superseded by Eleven v4 Turbo.',
        status: 'legacy',
        recommendedReplacementModelKey: 'elevenlabs:eleven_v4_turbo',
        maxCharactersPerRequest: 5_000,
        languageCount: 74,
        medianLatencyMs: 280,
        capabilities: createCapabilities({
            supportsAudioTags: true,
            supportsStyleSetting: false,
            supportsSpeakerBoostSetting: true,
            supportsSpeedSetting: null,
            supportsSsml: false,
            supportsPronunciationDictionaryPhonemes: null,
            supportsProfessionalVoiceClones: false
        }),
        pricing: ELEVENLABS_HALF_RATE_PRICING,
        sources: [ELEVENLABS_MODELS_SOURCE, ELEVENLABS_MODELS_API_SOURCE, ELEVENLABS_TEXT_TO_SPEECH_SOURCE, ELEVENLABS_PRICING_SOURCE],
        tags: ['legacy', 'realtime', 'expressive', 'audio-tags']
    },
    {
        modelKey: 'elevenlabs:eleven_multilingual_v2',
        provider: 'elevenlabs',
        modelId: 'eleven_multilingual_v2',
        aliases: [],
        displayName: 'Eleven Multilingual v2',
        family: 'eleven_multilingual',
        description:
            'Long-standing emotionally rich model in 29 languages and the ElevenLabs API default when no model_id is sent. Most stable option for long-form generation but without audio-tag control.',
        status: 'active',
        recommendedReplacementModelKey: null,
        maxCharactersPerRequest: 10_000,
        languageCount: 29,
        medianLatencyMs: null,
        capabilities: createCapabilities({
            supportsAudioTags: false,
            supportsStyleSetting: true,
            supportsSpeakerBoostSetting: true,
            supportsSpeedSetting: true,
            supportsSsml: true,
            supportsPronunciationDictionaryPhonemes: false,
            supportsProfessionalVoiceClones: true
        }),
        pricing: ELEVENLABS_BASE_RATE_PRICING,
        sources: [
            ELEVENLABS_MODELS_SOURCE,
            ELEVENLABS_MODELS_API_SOURCE,
            ELEVENLABS_TEXT_TO_SPEECH_SOURCE,
            ELEVENLABS_PRONUNCIATION_DICTIONARIES_SOURCE,
            ELEVENLABS_PRICING_SOURCE
        ],
        tags: ['narration', 'stable', 'multilingual', 'api-default']
    },
    {
        modelKey: 'elevenlabs:eleven_flash_v2_5',
        provider: 'elevenlabs',
        modelId: 'eleven_flash_v2_5',
        aliases: [],
        displayName: 'Eleven Flash v2.5',
        family: 'eleven_flash',
        description:
            'Ultra-low-latency model (roughly 75 ms) in 32 languages with the largest per-request character limit and half the credit cost. Best for speed and cost over expressiveness.',
        status: 'active',
        recommendedReplacementModelKey: null,
        maxCharactersPerRequest: 40_000,
        languageCount: 32,
        medianLatencyMs: 75,
        capabilities: ELEVENLABS_V2_GENERATION_CAPABILITIES,
        pricing: ELEVENLABS_HALF_RATE_PRICING,
        sources: [ELEVENLABS_MODELS_SOURCE, ELEVENLABS_MODELS_API_SOURCE, ELEVENLABS_TEXT_TO_SPEECH_SOURCE, ELEVENLABS_PRICING_SOURCE],
        tags: ['cheap', 'low-latency', 'multilingual']
    },
    {
        modelKey: 'elevenlabs:eleven_flash_v2',
        provider: 'elevenlabs',
        modelId: 'eleven_flash_v2',
        aliases: [],
        displayName: 'Eleven Flash v2',
        family: 'eleven_flash',
        description:
            'English-only ultra-low-latency model at half the credit cost. The only current model that honors SSML phoneme tags alongside pronunciation dictionary phonemes.',
        status: 'specialized',
        recommendedReplacementModelKey: null,
        maxCharactersPerRequest: 30_000,
        languageCount: 1,
        medianLatencyMs: 75,
        capabilities: createCapabilities({
            ...ELEVENLABS_V2_GENERATION_CAPABILITIES,
            supportsPronunciationDictionaryPhonemes: true
        }),
        pricing: ELEVENLABS_HALF_RATE_PRICING,
        sources: [
            ELEVENLABS_MODELS_SOURCE,
            ELEVENLABS_MODELS_API_SOURCE,
            ELEVENLABS_PRONUNCIATION_DICTIONARIES_SOURCE,
            ELEVENLABS_PRICING_SOURCE
        ],
        tags: ['cheap', 'low-latency', 'english-only', 'phonemes']
    },
    {
        modelKey: 'elevenlabs:eleven_turbo_v2_5',
        provider: 'elevenlabs',
        modelId: 'eleven_turbo_v2_5',
        aliases: [],
        displayName: 'Eleven Turbo v2.5',
        family: 'eleven_turbo',
        description: 'First-generation low-latency model in 32 languages. Deprecated by ElevenLabs in favor of Flash v2.5.',
        status: 'deprecated',
        recommendedReplacementModelKey: 'elevenlabs:eleven_flash_v2_5',
        maxCharactersPerRequest: 40_000,
        languageCount: 32,
        medianLatencyMs: null,
        capabilities: ELEVENLABS_V2_GENERATION_CAPABILITIES,
        pricing: ELEVENLABS_HALF_RATE_PRICING,
        sources: [ELEVENLABS_MODELS_SOURCE, ELEVENLABS_MODELS_API_SOURCE, ELEVENLABS_PRICING_SOURCE],
        tags: ['deprecated', 'low-latency', 'multilingual']
    },
    {
        modelKey: 'elevenlabs:eleven_turbo_v2',
        provider: 'elevenlabs',
        modelId: 'eleven_turbo_v2',
        aliases: [],
        displayName: 'Eleven Turbo v2',
        family: 'eleven_turbo',
        description: 'First-generation English-only low-latency model. Deprecated by ElevenLabs in favor of Flash v2.',
        status: 'deprecated',
        recommendedReplacementModelKey: 'elevenlabs:eleven_flash_v2',
        maxCharactersPerRequest: 30_000,
        languageCount: 1,
        medianLatencyMs: null,
        capabilities: ELEVENLABS_V2_GENERATION_CAPABILITIES,
        pricing: ELEVENLABS_HALF_RATE_PRICING,
        sources: [ELEVENLABS_MODELS_SOURCE, ELEVENLABS_MODELS_API_SOURCE, ELEVENLABS_PRICING_SOURCE],
        tags: ['deprecated', 'low-latency', 'english-only']
    }
] as const;
