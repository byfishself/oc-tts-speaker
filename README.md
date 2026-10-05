# TTS Speaker (`oc-tts-speaker`)

English | [日本語](README.ja.md)

**TTS Speaker** is a local text-to-speech playback extension for [OpenClaw](https://github.com/openclaw/openclaw). It converts assistant responses into speech using a locally running TTS engine and plays the generated audio on the computer.

> **Supported TTS engine:** VOICEVOX Engine only. Other TTS engines are not currently supported.

## Goals

- Play OpenClaw assistant responses aloud through the local audio output.
- Keep synthesis local by sending text to a local VOICEVOX Engine instance.
- Queue playback sequentially so responses do not overlap.
- Allow the default voice and speech speed to be configured through OpenClaw, while voice definitions are managed in `voices.json`.
- Support VOICEVOX style selection through the `[[tts:speakerVoiceId=ID]]` directive when that directive is present in the assistant output.

TTS Speaker uses its own playback flow. Disable OpenClaw's built-in automatic TTS if you do not want the same response to be spoken twice.

## Streaming TTS

TTS Speaker can receive assistant text from the OpenClaw Gateway while an agent response is still being generated. When streaming text contains a completed sentence, that sentence is sent to the local TTS playback queue immediately instead of waiting for the entire response to finish.

The streaming flow works as follows:

1. The assistant's streamed text is accumulated per agent run.
2. Completed sentences are detected using Japanese and common sentence-ending punctuation (`。`, `！`, `？`, `!`, `?`).
3. Each completed sentence is synthesized and added to the sequential playback queue.
4. Additional sentences are played in order as they become available.
5. When the agent run ends, any remaining text in the stream buffer is queued.
6. If no streaming text was received for the run, the normal `agent_end` fallback plays the completed assistant response instead.

This prevents a streamed response from being spoken a second time by the completion fallback.

The streaming state is shared across TTS Speaker plugin registration instances so that the streaming handler and the `agent_end` fallback can correctly recognize the same OpenClaw agent run.

### Playback characteristics

- **Sentence-by-sentence:** completed sentences can begin playback before the model finishes generating the full response.
- **Sequential:** sentences are queued and played one at a time; they do not overlap.
- **Buffered remainder:** text without a completed sentence terminator remains buffered until the agent run ends.
- **Fallback:** non-streaming or otherwise unobserved runs still use the normal completed-response playback path.
- **Japanese-oriented:** sentence splitting is designed around Japanese punctuation while also accepting common `!`/`?` terminators.

## Requirements

- OpenClaw
- Node.js `>=24.16.0 <25`
- VOICEVOX Engine running locally (default URL: `http://127.0.0.1:50021`)
- A VOICEVOX speaker/style ID that exists in your installed Engine version

## Installation

Clone the repository and build the TypeScript source:

```powershell
git clone https://github.com/byfishself/oc-tts-speaker.git
cd oc-tts-speaker
npm ci
npm run build
```

Link the local extension to OpenClaw:

```powershell
openclaw plugins install --link . --force
```

After installation, enable the plugin in OpenClaw if it is not already enabled. On plugin activation, TTS Speaker automatically creates its voice configuration file if it does not exist; opening the plugin settings UI is not required. See [Voice configuration file](#voice-configuration-file) below.

If the extension is already linked, rebuild after source changes and reload the plugin or restart the OpenClaw Gateway as appropriate for your setup.

## Configuration

The `openclaw.json` entry is intentionally minimal. TTS runtime settings are not stored in the OpenClaw plugin config.

```json
{
  "plugins": {
    "entries": {
      "tts-speaker": {
        "enabled": true,
        "config": {}
      }
    }
  }
}
```

Do **not** put `speedScale`, `defaultSpeakerId`, `fallbackSpeakerId`, `additionalVoices`, or other TTS runtime settings inside `plugins.entries.tts-speaker.config`.

### Runtime settings

Persistent TTS runtime settings are stored in:

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\config.json
```

The file is created automatically when the plugin initializes if it does not already exist.

Example:

```json
{
  "enabled": true,
  "agents": {
    "my-agent": {
      "enabled": true,
      "read": "all"
    },
    "coding": {
      "enabled": false,
      "read": "off"
    }
  },
  "speedScale": 1.2
}
```

- `enabled`: master TTS switch.
- `agents`: per-agent TTS policy.
- `agents.<agentId>.enabled`: whether that agent is spoken.
- `agents.<agentId>.read`: `off`, `final`, or `all`.
  - `off`: do not speak the agent.
  - `final`: speak only the completed response.
  - `all`: stream completed sentences into the playback queue while the response is generated.
- `speedScale`: VOICEVOX speech speed multiplier.

Use the actual OpenClaw agent ID as `<agentId>`. You can find the IDs with:

```powershell
openclaw agents list
```

Only agents explicitly enabled in this file are spoken. Agents not listed in `agents` are not spoken.

### Voice configuration

Voice selection is stored separately in:

```text
%USERPROFILE%\\.openclaw\\TTS Speaker\\tts-speaker\\voices.json
```

The file is created automatically when the plugin initializes if it does not exist.

Example:

```json
{
  "defaultSpeakerId": 102,
  "fallbackSpeakerId": 3,
  "voices": [
    {
      "id": 102,
      "description": "Normal voice for ordinary conversation."
    },
    {
      "id": 103,
      "description": "Sweet, affectionate, soft, gentle emotional tone."
    },
    {
      "id": 105,
      "description": "Quiet, intimate, whispering emotional tone."
    }
  ]
}
```

- `defaultSpeakerId`: default VOICEVOX style ID.
- `fallbackSpeakerId`: fallback style ID used when the selected voice cannot be used.
- `voices`: available voice definitions and their descriptions.

These values are not configured through `openclaw.json`.

## Voice selection

For the built-in style IDs and instructions for listing every style available in your local Engine, see [VOICEVOX Speakers and Style IDs](VOICEVOX_SPEAKERS.md).

The extension recognizes this directive in assistant output:

```text
[[tts:speakerVoiceId=103]]
```

The numeric value is a VOICEVOX **style ID** (`styles[].id`), not a character ID. If no valid voice directive is found, the configured default voice is used. Since directive generation currently depends on the assistant output, voice selection is best-effort rather than guaranteed for every response.

## Playback behavior and current scope

- Assistant text can be received from the OpenClaw Gateway while the agent is still generating a response.
- Completed sentences are synthesized and played as soon as they are available.
- Audio is synthesized by VOICEVOX Engine and played locally.
- Playback requests are queued sequentially, and sentences do not overlap.
- If streaming text is not observed for an agent run, the completed assistant response is handled through the `agent_end` fallback.
- A streamed run is not replayed in full by the fallback path after its streamed sentences have already been queued.

## Development

```powershell
npm install
npm run build
```

The project uses TypeScript and outputs compiled files under `dist/`. Do not commit local secrets, tokens, or personal OpenClaw configuration to this repository.

## License

This project is distributed under the terms in the [LICENSE](LICENSE) file.
