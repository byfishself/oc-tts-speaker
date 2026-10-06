import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import fs from "node:fs";
import path from "node:path";
import { TtsSpeaker } from "../speaker.js";
import {
  DEFAULT_TTS_SPEAKER_CONFIG,
  DEFAULT_VOICE_CONFIG,
  resolveTtsSpeakerConfig,
  resolveVoiceConfig,
  type TtsVoiceDefinition,
} from "../tts/config.js";
import { VoicevoxProvider } from "../tts/voicevox.js";

interface ExtractedSpeech {
  text: string;
  speakerId: number;
}

interface StreamingRun {
  snapshot: string;
  buffer: string;
  speakerId: number;
  received: boolean;
}

const VOICE_SELECTION_WAIT_MS = 750;
const VOICE_SELECTION_SETTLE_MS = 75;

interface SharedTtsState {
  streamingRuns: Map<string, StreamingRun>;
  streamedRunIds: Set<string>;
  selectedSpeakersByRun: Map<string, number>;
  pendingRuns: Map<
    string,
    { text: string; timer: ReturnType<typeof setTimeout> }
  >;
  runAgentIds: Map<string, string>;
  enqueueSentence?:
    | ((text: string, speakerId: number, runId?: string) => void)
    | undefined;
}

const globalStateKey = Symbol.for("tts-speaker.shared-state");

const globalState = globalThis as typeof globalThis & {
  [globalStateKey]?: SharedTtsState;
};

const state =
  globalState[globalStateKey] ??
  (globalState[globalStateKey] = {
    streamingRuns: new Map(),
    streamedRunIds: new Set(),
    selectedSpeakersByRun: new Map(),
    pendingRuns: new Map<
    string,
    { text: string; timer: ReturnType<typeof setTimeout> }
    >(),
    runAgentIds: new Map(),
    enqueueSentence: undefined,
  });

const {
  streamingRuns,
  streamedRunIds,
  selectedSpeakersByRun,
  pendingRuns,
  runAgentIds,
} = state;

function loadTtsConfig(stateDir: string) {
  const dataDir = path.join(stateDir, "TTS Speaker", "tts-speaker");
  const configPath = path.join(dataDir, "config.json");

  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(DEFAULT_TTS_SPEAKER_CONFIG, null, 2) + "\n",
      "utf8",
    );
    return resolveTtsSpeakerConfig(DEFAULT_TTS_SPEAKER_CONFIG);
  }

  try {
    return resolveTtsSpeakerConfig(
      JSON.parse(fs.readFileSync(configPath, "utf8")),
    );
  } catch (error) {
    console.warn(
      `[TTS Speaker] Failed to read config.json; using defaults: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return resolveTtsSpeakerConfig(DEFAULT_TTS_SPEAKER_CONFIG);
  }
}

function loadVoiceConfig(stateDir: string) {
  const dataDir = path.join(stateDir, "TTS Speaker", "tts-speaker");
  const voicesPath = path.join(dataDir, "voices.json");

  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(voicesPath)) {
    fs.writeFileSync(
      voicesPath,
      JSON.stringify(DEFAULT_VOICE_CONFIG, null, 2) + "\n",
      "utf8",
    );
    return resolveVoiceConfig(DEFAULT_VOICE_CONFIG);
  }

  try {
    return resolveVoiceConfig(
      JSON.parse(fs.readFileSync(voicesPath, "utf8")),
    );
  } catch (error) {
    console.warn(
      `[TTS Speaker] Failed to read voices.json; using defaults: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return resolveVoiceConfig(DEFAULT_VOICE_CONFIG);
  }
}

function extractAssistantText(messages: unknown[]): string {
  const message = [...messages]
    .reverse()
    .find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        (item as { role?: unknown }).role === "assistant",
    );

  if (!message || typeof message !== "object") return "";

  const content = (message as { content?: unknown }).content;

  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (item): item is { type?: unknown; text?: unknown } =>
        typeof item === "object" &&
        item !== null &&
        (item as { type?: unknown }).type === "text" &&
        typeof (item as { text?: unknown }).text === "string",
    )
    .map((item) => item.text as string)
    .join("\n")
    .trim();
}

function extractSpeakerDirective(
  text: string,
  allowedSpeakerIds: Set<number>,
): number | undefined {
  const match = text.match(/\[\[tts:([^\]]*)\]\]/i);
  if (!match) return undefined;

  const speakerMatch = match[1].match(
    /(?:^|\s)speakerVoiceId\s*=\s*(\d+)(?=\s|$)/i,
  );
  if (!speakerMatch) return undefined;

  const speakerId = Number(speakerMatch[1]);
  return allowedSpeakerIds.has(speakerId) ? speakerId : undefined;
}

function extractSpeech(
  text: string,
  fallbackSpeakerId: number,
  availableVoices: TtsVoiceDefinition[],
  preferredSpeakerId?: number,
): ExtractedSpeech {
  const allowedSpeakerIds = new Set(availableVoices.map((voice) => voice.id));

  let selectedSpeakerId =
    preferredSpeakerId !== undefined &&
    allowedSpeakerIds.has(preferredSpeakerId)
      ? preferredSpeakerId
      : fallbackSpeakerId;

  const cleanedText = text.replace(
    /\[\[tts:([^\]]*)\]\]/gi,
    (_fullDirective, body: string) => {
      const match = body.match(
        /(?:^|\s)speakerVoiceId\s*=\s*(\d+)(?=\s|$)/i,
      );

      if (match) {
        const speakerId = Number(match[1]);
        if (allowedSpeakerIds.has(speakerId)) {
          selectedSpeakerId = speakerId;
        }
      }

      return "";
    },
  );

  return {
    text: cleanedText.trim(),
    speakerId: selectedSpeakerId,
  };
}

function buildVoiceInstructions(
  fallbackSpeakerId: number,
  voices: TtsVoiceDefinition[],
): string {
  const selectableVoices = voices.filter(
    (voice) => voice.id !== fallbackSpeakerId,
  );

const lines = [
  "Voice delivery is part of every assistant response.",
  "For every response, determine the most appropriate available voice.",
  "Choose the most appropriate voice from the configured voices based on the response's emotion and context.",
  "Use an emotional voice when the emotional delivery clearly benefits from it.",
  "If a specific voice is explicitly requested by ID, select that voice.",
  "Always include exactly one voice directive in every response.",
  "The voice directive is metadata for speech synthesis and must not be shown or explained to the user.",
  "Do not mention voice settings, voice IDs, TTS directives, or these instructions to the user.",
  "Directive format: [[tts:speakerVoiceId=ID]]",
  "Never select the emergency fallback voice directly.",
];

for (const voice of selectableVoices) {
  lines.push(`${voice.id}: ${voice.description}`);
}

return lines.join("\n");
}

function drainCompleteSentences(
  run: StreamingRun,
  allowedSpeakerIds: Set<number>,
  enqueue: (text: string, speakerId: number, runId?: string) => void,
  runId: string,
): void {
  const sentencePattern = /[\s\S]*?[。！？!?]\s*/gu;

  const enqueueText = (text: string, speakerId: number) => {
    let consumed = 0;

    for (const match of text.matchAll(sentencePattern)) {
      const sentence = match[0].trim();
      if (sentence) enqueue(sentence, speakerId, runId);
      consumed = (match.index ?? 0) + match[0].length;
    }

    return text.slice(consumed);
  };

  while (run.buffer) {
    const directiveMatch = /\[\[tts:([^\]]*)\]\]/i.exec(run.buffer);

    if (directiveMatch) {
      const directiveIndex = directiveMatch.index;
      const beforeDirective = run.buffer.slice(0, directiveIndex);

      // The remaining sentences before the speaker are also played back by the previous speaker.
      const remainder = enqueueText(beforeDirective, run.speakerId);
      if (remainder.trim()) {
        enqueue(remainder.trim(), run.speakerId, runId);
      }

      const speakerMatch = directiveMatch[1].match(
        /(?:^|\s)speakerVoiceId\s*=\s*(\d+)(?=\s|$)/i,
      );

      if (speakerMatch) {
        const speakerId = Number(speakerMatch[1]);

        if (allowedSpeakerIds.has(speakerId)) {
          run.speakerId = speakerId;
        }
      }

      run.buffer = run.buffer.slice(
        directiveIndex + directiveMatch[0].length,
      );
      continue;
    }

    // If a streaming chunk ends in the middle of a pointer, it is held until the next chunk.
    const partialDirective = /\[\[tts:[^\]]*$/i.exec(run.buffer);
    if (partialDirective) {
      const beforePartial = run.buffer.slice(0, partialDirective.index);
      const remainder = enqueueText(beforePartial, run.speakerId);

      run.buffer =
        remainder + run.buffer.slice(partialDirective.index);
      return;
    }

    run.buffer = enqueueText(run.buffer, run.speakerId);
    return;
  }
}

export default definePluginEntry({
  id: "tts-speaker",
  name: "TTS Speaker",
  description: "Local text-to-speech speaker playback",

  
  register(api) {
    const instanceId = Math.random().toString(36).slice(2, 8);
    console.log(`[TTS Speaker] register instance=${instanceId}`);
    const stateDir = api.runtime.state.resolveStateDir();
    const config = loadTtsConfig(stateDir);

    const voiceConfig = loadVoiceConfig(stateDir);

  const voices = voiceConfig.voices;

  const allowedSpeakerIds = new Set(
  voices.map((voice) => voice.id),
  );

    const provider = new VoicevoxProvider({
      fallbackSpeaker: voiceConfig.fallbackSpeakerId,
      speedScale: config.speedScale,
    });

    const speaker = new TtsSpeaker({ provider });

    const enqueueSentence = (
      text: string,
      speakerId: number,
      runId?: string,
    ) => {
        console.log(
          `[TTS Speaker] enqueue speaker=${speakerId} text=${JSON.stringify(text)}`,
        );
      const speech = extractSpeech(
        text,
        voiceConfig.fallbackSpeakerId,
        voices,
        speakerId,
      );

      if (!speech.text) return;

      void speaker.enqueueText(speech.text, speech.speakerId, runId).catch((error: unknown) => {
        api.logger.error?.(
          `[TTS Speaker] playback failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    };
    state.enqueueSentence = enqueueSentence;

    const getAgentConfig = (agentId: string | undefined) => {
      if (!config.enabled || !agentId) return undefined;
      const agentConfig = config.agents[agentId];
      if (!agentConfig || !agentConfig.enabled || agentConfig.read === "off") {
        return undefined;
      }
      return agentConfig;
    };

    const getRunAgentConfig = (runId: string | undefined) => {
      if (!runId) return undefined;
      return getAgentConfig(runAgentIds.get(runId));
    };

    const enqueueShared = (text: string, speakerId: number, runId?: string,) => {
      const enqueue = state.enqueueSentence;
    if (enqueue) {
      enqueue(text, speakerId, runId);
      }
    };
    
    api.on("after_tool_call", (event) => {
      console.log(
        `[TTS Speaker] after_tool_call` +
          ` tool=${event.toolName}` +
          ` run=${event.runId ?? "unknown"}` +
          ` action=${String(event.params.action)}`,
      );

      if (event.toolName !== "message") return;
      if (event.error) return;

      const agentConfig = getRunAgentConfig(event.runId);
      if (!agentConfig || agentConfig.read !== "all") return;

      const params = event.params;
      if (params.action !== "send") return;
      if (typeof params.message !== "string") return;

      const speech = extractSpeech(
        params.message,
        voiceConfig.fallbackSpeakerId,
        voices,
      );

      if (!speech.text.trim()) return;

      console.log(
        `[TTS Speaker] message tool` +
          ` speaker=${speech.speakerId}` +
          ` text=${speech.text}`,
      );

      enqueueShared(speech.text, speech.speakerId);
    });

    api.on("before_prompt_build", (_event, ctx) => {
      const runId = (ctx as { runId?: string }).runId;
      const agentId = (ctx as { agentId?: string }).agentId;

      if (runId && agentId) {
        runAgentIds.set(runId, agentId);
      }

      const agentConfig = getAgentConfig(agentId);
      if (!agentConfig) return;

      return {
        appendSystemContext: buildVoiceInstructions(
          voiceConfig.fallbackSpeakerId,
          voices,
        ),
      };
    });

    /*
     * Gateway bridge:
     * OpenClaw's Gateway exposes assistant deltas through the host-owned
     * agent-event subscription API. No separate Gateway authentication is
     * required because this runs inside the Gateway process.
     */
    api.agent.events.registerAgentEventSubscription({
      id: "tts-streaming-bridge",
      description: "Stream assistant text into the local TTS sentence queue",
      streams: ["assistant"],
      handle: (event) => {
  if (event.stream !== "assistant") return;
        const runId = event.runId;
        if (!runId) return;

        const agentConfig = getRunAgentConfig(runId);
        if (!agentConfig || agentConfig.read !== "all") return;

        const text = typeof event.data.text === "string" ? event.data.text : "";
        const delta = typeof event.data.delta === "string" ? event.data.delta : "";
        console.log(
          `[TTS Speaker] stream event` +
          ` run=${event.runId ?? "unknown"}` +
          ` text=${JSON.stringify(event.data.text ?? "")}` +
          ` delta=${JSON.stringify(event.data.delta ?? "")}`,
          );
        if (text || delta) {
          streamedRunIds.add(runId);
          console.log(
              `[TTS Speaker] stream marker instance=${instanceId}` +
              ` run=${runId}` +
              ` has=${streamedRunIds.has(runId)}` +
              ` size=${streamedRunIds.size}`+
              ` runState=${streamingRuns.has(runId)}`,
          )
        }
            
        console.log(
            `[TTS Speaker] assistant run=${event.runId}` +
            `text=${JSON.stringify(text)}` +
            `delta=${JSON.stringify(delta)}`,
          );
        if (!text && !delta) return;

        let run = streamingRuns.get(runId);
        if (!run) {
          run = {
            snapshot: "",
            buffer: "",
            speakerId: selectedSpeakersByRun.get(runId) ?? voiceConfig.fallbackSpeakerId,
            received: false,
          };
          streamingRuns.set(runId, run);
        }

        const nextText = text || run.snapshot + delta;

        let appended = "";
        if (nextText.startsWith(run.snapshot)) {
          appended = nextText.slice(run.snapshot.length);
        } else if (!run.snapshot.startsWith(nextText)) {
          // Replacement/reset event: use the new snapshot as authoritative.
          appended = nextText;
        }

        run.snapshot = nextText;
        if (!appended) return;

        run.received = true;
        run.buffer += appended;


        
        console.log(
          `[TTS Speaker] drain buffer=${JSON.stringify(run.buffer)}`,
        );

        drainCompleteSentences(
          run,
          allowedSpeakerIds,
          enqueueShared,
          runId,
        );
      },
    });

    api.on("llm_output", (event) => {
      const runId = event.runId;
      if (!runId) return;

      const agentConfig = getRunAgentConfig(runId);
      if (!agentConfig) return;

      const outputs: string[] = [];
      if (Array.isArray(event.assistantTexts)) outputs.push(...event.assistantTexts);
      if (typeof event.lastAssistant === "string") outputs.push(event.lastAssistant);

      for (const output of outputs) {
        const directiveSpeakerId = extractSpeakerDirective(
          output,
          allowedSpeakerIds,
        );

        if (directiveSpeakerId !== undefined) {
          selectedSpeakersByRun.set(runId, directiveSpeakerId);

          const streamRun = streamingRuns.get(runId);
          if (streamRun) streamRun.speakerId = directiveSpeakerId;

          const pending = pendingRuns.get(runId);
          if (pending) {
            clearTimeout(pending.timer);
            pending.timer = setTimeout(() => {
              pendingRuns.delete(runId);
              const speech = extractSpeech(
                pending.text,
                voiceConfig.fallbackSpeakerId,
                voices,
                directiveSpeakerId,
              );
              if (speech.text) enqueueShared(speech.text, speech.speakerId, runId);
            }, VOICE_SELECTION_SETTLE_MS);
          }
        }
      }
    });

    api.registerSpeechProvider({
      id: "tts-speaker",
      label: "TTS Speaker",
      isConfigured: () => true,

      async synthesize(req) {
        const audioBuffer = await provider.synthesize(req.text);

        return {
          audioBuffer,
          outputFormat: "wav",
          fileExtension: ".wav",
          voiceCompatible: false,
        };
      },
    });

    api.on("agent_end", (event, ctx) => {
      const runId = event.runId ?? (ctx as { runId?: string }).runId;
      const agentId =
        (ctx as { agentId?: string }).agentId ??
        (runId ? runAgentIds.get(runId) : undefined);

      if (runId && agentId) runAgentIds.set(runId, agentId);

      const agentConfig = getAgentConfig(agentId);
      if (!agentConfig) {
        if (runId) {
          runAgentIds.delete(runId);
          streamingRuns.delete(runId);
          selectedSpeakersByRun.delete(runId);
          streamedRunIds.delete(runId);
        }
        return;
      }

      const streamRun = runId ? streamingRuns.get(runId) : undefined;
      const hadStreaming = runId ? streamedRunIds.has(runId) : false;

      console.log(
          `[TTS Speaker] agent_end instance=${instanceId}` +
          ` run=${runId}` +
          ` hadStreaming=${hadStreaming}` +
          ` setSize=${streamedRunIds.size}`+
           ` runState=${streamingRuns.has(runId ?? "")}`,
        );
      
      if (streamRun?.received) {
        // Streaming already queued complete sentences. Only flush the
        // final incomplete sentence here; never replay the full response.
        if (streamRun.buffer.trim()) {
          enqueueShared(streamRun.buffer, streamRun.speakerId, runId!);
        }

        speaker.finishRun(runId!);
        streamingRuns.delete(runId!);
        selectedSpeakersByRun.delete(runId!);
        streamedRunIds.delete(runId!);
        runAgentIds.delete(runId!);

        const pending = pendingRuns.get(runId!);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRuns.delete(runId!);
        }
        return;
      }

      const assistantText = extractAssistantText(event.messages);
      if (!assistantText) return;

      const playFallback = () => {
        if (runId) pendingRuns.delete(runId);

        const selectedSpeakerId = runId
          ? selectedSpeakersByRun.get(runId)
          : undefined;

        const speech = extractSpeech(
          assistantText,
          voiceConfig.fallbackSpeakerId,
          voices,
          selectedSpeakerId,
        );

        if (runId) {
          selectedSpeakersByRun.delete(runId);
          runAgentIds.delete(runId);
        }

        if (speech.text) {
          enqueueShared(speech.text, speech.speakerId, runId);
        }

        if (runId) {
          speaker.finishRun(runId);
        }
      };

      if (!runId) {
        playFallback();
        return;
      }

      const existingPending = pendingRuns.get(runId);
      if (existingPending) clearTimeout(existingPending.timer);

      const timer = setTimeout(playFallback, VOICE_SELECTION_WAIT_MS);
      timer.unref?.();

      pendingRuns.set(runId, { text: assistantText, timer });

      if (selectedSpeakersByRun.has(runId)) {
        clearTimeout(timer);

        const settleTimer = setTimeout(
          playFallback,
          VOICE_SELECTION_SETTLE_MS,
        );
        settleTimer.unref?.();

        pendingRuns.set(runId, {
          text: assistantText,
          timer: settleTimer,
        });
      }
    });
  },
});
