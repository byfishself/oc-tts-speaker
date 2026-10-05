export type TtsReadMode = "off" | "final" | "all";

export interface TtsAgentConfig {
  enabled: boolean;
  read: TtsReadMode;
}

export interface TtsVoiceDefinition {
  id: number;
  description: string;
}

export interface TtsVoiceConfig {
  defaultSpeakerId: number;
  fallbackSpeakerId: number;
  voices: TtsVoiceDefinition[];
}

export interface TtsSpeakerConfig {
  enabled: boolean;
  speedScale: number;
  agents: Record<string, TtsAgentConfig>;
}

export const DEFAULT_VOICE_CONFIG: TtsVoiceConfig = {
  defaultSpeakerId: 102,
  fallbackSpeakerId: 3,
  voices: [
    {
      id: 102,
      description: "Normal voice for ordinary conversation.",
    },
    {
      id: 103,
      description: "Sweet, affectionate, soft, gentle emotional tone.",
    },
    {
      id: 104,
      description: "Sad, sorrowful, disappointed, sympathetic emotional tone.",
    },
    {
      id: 105,
      description: "Quiet, intimate, whispering emotional tone.",
    },
    {
      id: 106,
      description: "Special voice for special occasions, such as birthdays.",
    },
  ],
};

export const DEFAULT_TTS_SPEAKER_CONFIG: TtsSpeakerConfig = {
  enabled: true,
  speedScale: 1.0,
  agents: {
    main: {
      enabled: true,
      read: "all",
    },
  },
};

function isValidVoiceDefinition(value: unknown): value is TtsVoiceDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const voice = value as Partial<TtsVoiceDefinition>;

  return (
    typeof voice.id === "number" &&
    Number.isInteger(voice.id) &&
    voice.id >= 0 &&
    typeof voice.description === "string" &&
    voice.description.length > 0
  );
}

function isValidVoiceConfig(value: unknown): value is TtsVoiceConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const config = value as Partial<TtsVoiceConfig>;

  return (
    typeof config.defaultSpeakerId === "number" &&
    Number.isInteger(config.defaultSpeakerId) &&
    config.defaultSpeakerId >= 0 &&
    typeof config.fallbackSpeakerId === "number" &&
    Number.isInteger(config.fallbackSpeakerId) &&
    config.fallbackSpeakerId >= 0 &&
    Array.isArray(config.voices) &&
    config.voices.every(isValidVoiceDefinition)
  );
}

export function resolveVoiceConfig(rawConfig: unknown): TtsVoiceConfig {
  if (!isValidVoiceConfig(rawConfig)) {
    return {
      defaultSpeakerId: DEFAULT_VOICE_CONFIG.defaultSpeakerId,
      fallbackSpeakerId: DEFAULT_VOICE_CONFIG.fallbackSpeakerId,
      voices: DEFAULT_VOICE_CONFIG.voices.map((voice) => ({ ...voice })),
    };
  }

  return {
    defaultSpeakerId: rawConfig.defaultSpeakerId,
    fallbackSpeakerId: rawConfig.fallbackSpeakerId,
    voices: rawConfig.voices.map((voice) => ({ ...voice })),
  };
}

function isValidReadMode(value: unknown): value is TtsReadMode {
  return value === "off" || value === "final" || value === "all";
}

function resolveAgentConfig(value: unknown): TtsAgentConfig | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const config = value as Record<string, unknown>;
  if (typeof config.enabled !== "boolean" || !isValidReadMode(config.read)) {
    return undefined;
  }

  return {
    enabled: config.enabled,
    read: config.read,
  };
}

export function resolveTtsSpeakerConfig(
  rawConfig: unknown,
): TtsSpeakerConfig {
  if (typeof rawConfig !== "object" || rawConfig === null) {
    return {
      enabled: DEFAULT_TTS_SPEAKER_CONFIG.enabled,
      speedScale: DEFAULT_TTS_SPEAKER_CONFIG.speedScale,
      agents: { ...DEFAULT_TTS_SPEAKER_CONFIG.agents },
    };
  }

  const config = rawConfig as Record<string, unknown>;

  const enabled =
    typeof config.enabled === "boolean"
      ? config.enabled
      : DEFAULT_TTS_SPEAKER_CONFIG.enabled;

  const speedScale =
    typeof config.speedScale === "number" &&
    Number.isFinite(config.speedScale) &&
    config.speedScale > 0
      ? config.speedScale
      : DEFAULT_TTS_SPEAKER_CONFIG.speedScale;

  const agents: Record<string, TtsAgentConfig> = {};
  if (typeof config.agents === "object" && config.agents !== null) {
    for (const [agentId, rawAgentConfig] of Object.entries(
      config.agents as Record<string, unknown>,
    )) {
      const agentConfig = resolveAgentConfig(rawAgentConfig);
      if (agentConfig) agents[agentId] = agentConfig;
    }
  }

  return {
    enabled,
    speedScale,
    agents:
      Object.keys(agents).length > 0
        ? agents
        : { ...DEFAULT_TTS_SPEAKER_CONFIG.agents },
  };
}
