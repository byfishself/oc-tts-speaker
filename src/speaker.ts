
import { VoicevoxProvider } from "./tts/voicevox.js";
import { DEFAULT_VOICE_CONFIG } from "./tts/config.js";
import type { TtsProvider } from "./tts/types.js";
import { playWav } from "./playback/player.js";

export interface SpeakerAwareTtsProvider extends TtsProvider {
  synthesizeWithSpeaker(text: string, speakerId: number): Promise<Buffer>;
}

export interface TtsSpeakerOptions {
  provider?: TtsProvider;
}

interface QueueItem {
  text: string;
  speakerId?: number;
  runId: string;
  sentenceIndex: number;
}

interface ResponseState {
  estimatedDurationMs: number;
  sentenceCount: number;
  firstThreeSpeakerId?: number;
  overBudget: boolean;
  truncated: boolean;
}

const MAX_RESPONSE_DURATION_MS = 60_000;
const MAX_KEPT_SENTENCES = 5;
const JAPANESE_CHARACTERS_PER_SECOND = 7;

function splitJapaneseSentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[。！？!?])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function estimateDurationMs(text: string): number {
  // A conservative initial estimate; actual duration depends on the voice
  // and VOICEVOX speed settings.
  return Math.max(
    500,
    (Array.from(text).length / JAPANESE_CHARACTERS_PER_SECOND) * 1000,
  );
}

export class TtsSpeaker {
  private readonly tts: TtsProvider;
  private queue: QueueItem[] = [];
  private activeItem?: QueueItem;
  private draining = false;
  private anonymousGroupId = 0;
  private readonly responseStates = new Map<string, ResponseState>();

  constructor(options: TtsSpeakerOptions = {}) {
    this.tts = options.provider ?? new VoicevoxProvider({
      fallbackSpeaker: DEFAULT_VOICE_CONFIG.fallbackSpeakerId,
    });
  }

  speak(text: string, speakerId?: number): Promise<void> {
    return this.enqueueText(text, speakerId);
  }

  enqueueText(
    text: string,
    speakerId?: number,
    runId?: string,
  ): Promise<void> {
    const groupId = runId ?? `standalone-${++this.anonymousGroupId}`;
    const isStandalone = runId === undefined;
    const sentences = splitJapaneseSentences(text);

    if (sentences.length === 0) return Promise.resolve();

    let response = this.responseStates.get(groupId);
    if (!response) {
      response = {
        estimatedDurationMs: 0,
        sentenceCount: 0,
        overBudget: false,
        truncated: false,
      };
      this.responseStates.set(groupId, response);
    }

    for (const sentence of sentences) {
      response.sentenceCount += 1;
      const sentenceIndex = response.sentenceCount;
      response.estimatedDurationMs += estimateDurationMs(sentence);

      if (sentenceIndex <= MAX_KEPT_SENTENCES) {
        response.firstThreeSpeakerId = speakerId;
      }

      if (response.estimatedDurationMs > MAX_RESPONSE_DURATION_MS) {
        response.overBudget = true;
      }

      if (response.truncated) continue;

      if (response.overBudget && sentenceIndex > MAX_KEPT_SENTENCES) {
        response.truncated = true;
        this.trimResponse(groupId, response.firstThreeSpeakerId);
        continue;
      }

      this.queue.push({
        text: sentence,
        speakerId,
        runId: groupId,
        sentenceIndex,
      });
    }

    if (isStandalone) {
      this.responseStates.delete(groupId);
    }

    this.startDrain();
    return Promise.resolve();
  }

  finishRun(runId: string): void {
    this.responseStates.delete(runId);
  }

  private trimResponse(runId: string, speakerId?: number): void {
    // Preserve the active sentence. Remove only waiting sentences belonging
    // to this response, keeping its first three sentences.
    this.queue = this.queue.filter(
      (item) =>
        item.runId !== runId ||
        item.sentenceIndex <= MAX_KEPT_SENTENCES,
    );

    // Avoid adding the marker more than once.
    if (
      this.activeItem?.runId === runId &&
      this.activeItem.text.trim() === "以下略。"
    ) {
      return;
    }

    if (this.queue.some(
      (item) => item.runId === runId && item.text.trim() === "以下略。",
    )) {
      return;
    }

    const marker: QueueItem = {
      text: "以下略。",
      speakerId,
      runId,
      sentenceIndex: MAX_KEPT_SENTENCES + 1,
    };

    // Place the marker immediately after this response's retained sentences.
    let lastKeptIndex = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i]!;
      if (
        item.runId === runId &&
        item.sentenceIndex <= MAX_KEPT_SENTENCES
      ) {
        lastKeptIndex = i;
      }
    }

    this.queue.splice(lastKeptIndex + 1, 0, marker);
  }

  private startDrain(): void {
    if (this.draining) return;
    this.draining = true;
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        this.activeItem = item;

        try {
          const audio = await this.synthesize(item.text, item.speakerId);
          await playWav(audio);
        } catch (error) {
          console.error(
            `[TTS Speaker] Failed to play sentence: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } finally {
          this.activeItem = undefined;
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length > 0) this.startDrain();
    }
  }

  private async synthesize(
    text: string,
    speakerId?: number,
  ): Promise<Buffer> {
    if (
      speakerId !== undefined &&
      this.isSpeakerAwareProvider(this.tts)
    ) {
      return this.tts.synthesizeWithSpeaker(text, speakerId);
    }

    return this.tts.synthesize(text);
  }

  private isSpeakerAwareProvider(
    provider: TtsProvider,
  ): provider is SpeakerAwareTtsProvider {
    return (
      "synthesizeWithSpeaker" in provider &&
      typeof provider.synthesizeWithSpeaker === "function"
    );
  }
}