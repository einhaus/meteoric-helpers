import type { SpeechModelProfile, SpeechProvider } from './speechModelTypes.js';

export type SpeechProviderModelProfileMap = Readonly<Record<SpeechModelProfile, string | null>>;

export type SpeechModelProfileCostPolicy = Readonly<{
    /** Highest per-character credit multiplier a profile default may use without an explicit approval. */
    maxCharacterCostMultiplier: number | null;
    notes: string;
}>;

export type SpeechProviderModelProfileCostPolicyMap = Readonly<Record<SpeechModelProfile, SpeechModelProfileCostPolicy>>;

const createCostPolicy = (policy: SpeechModelProfileCostPolicy): SpeechModelProfileCostPolicy => policy;

export const SPEECH_PROVIDER_MODEL_PROFILES: Readonly<Record<SpeechProvider, SpeechProviderModelProfileMap>> = {
    elevenlabs: {
        narration: 'elevenlabs:eleven_v4',
        realtime: 'elevenlabs:eleven_v4_turbo',
        cheap: 'elevenlabs:eleven_flash_v2_5'
    }
} as const;

export const SPEECH_PROVIDER_MODEL_PROFILE_COST_POLICIES: Readonly<Record<SpeechProvider, SpeechProviderModelProfileCostPolicyMap>> = {
    elevenlabs: {
        narration: createCostPolicy({
            maxCharacterCostMultiplier: 1,
            notes: 'Narration defaults may use any base-rate model (1 credit per character); higher multipliers require explicit approval.'
        }),
        realtime: createCostPolicy({
            maxCharacterCostMultiplier: 0.5,
            notes: 'Real-time defaults must stay on a half-rate low-latency model.'
        }),
        cheap: createCostPolicy({
            maxCharacterCostMultiplier: 0.5,
            notes: 'Cheap defaults must stay on a half-rate model.'
        })
    }
} as const;

export const SPEECH_GLOBAL_MODEL_PROFILES: SpeechProviderModelProfileMap = SPEECH_PROVIDER_MODEL_PROFILES.elevenlabs;
