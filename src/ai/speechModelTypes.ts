import type { AiCapabilitySupport, AiModelSource, AiModelStatus } from './aiModelTypes.js';

export type SpeechProvider = 'elevenlabs';

/**
 * Shared text-to-speech use-case profiles.
 * - `narration`: highest quality, long-form spoken content (sessions, lessons, audiobooks).
 * - `realtime`: low-latency conversational output (voice agents, live previews).
 * - `cheap`: lowest cost per character where quality is secondary.
 */
export type SpeechModelProfile = 'narration' | 'realtime' | 'cheap';

export type SpeechModelCapabilities = Readonly<{
    supportsAudioTags: AiCapabilitySupport;
    supportsStyleSetting: AiCapabilitySupport;
    supportsSpeakerBoostSetting: AiCapabilitySupport;
    supportsSpeedSetting: AiCapabilitySupport;
    supportsSsml: AiCapabilitySupport;
    supportsPronunciationDictionaryPhonemes: AiCapabilitySupport;
    supportsProfessionalVoiceClones: AiCapabilitySupport;
}>;

export type SpeechModelPricing = Readonly<{
    /** Credits charged per input character relative to the provider's base rate (1 = base rate, 0.5 = half). */
    characterCostMultiplier: number | null;
    notes: string | null;
}>;

export type SpeechModelCatalogEntry = Readonly<{
    modelKey: string;
    provider: SpeechProvider;
    modelId: string;
    aliases: readonly string[];
    displayName: string;
    family: string;
    description: string;
    status: AiModelStatus;
    recommendedReplacementModelKey: string | null;
    maxCharactersPerRequest: number | null;
    languageCount: number | null;
    medianLatencyMs: number | null;
    capabilities: SpeechModelCapabilities;
    pricing: SpeechModelPricing;
    sources: readonly AiModelSource[];
    tags: readonly string[];
}>;

export type SpeechResolvedModelConfig = Readonly<{
    provider: SpeechProvider;
    profile: SpeechModelProfile;
    requestedModel: string | null;
    modelKey: string | null;
    modelId: string;
    catalogEntry: SpeechModelCatalogEntry | null;
    warnings: readonly string[];
    overridesApplied: readonly string[];
}>;
