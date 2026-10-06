import { TtsSpeaker } from "./speaker.js";
import { VoicevoxProvider } from "./tts/voicevox.js";

async function main(): Promise<void> {
  const text = process.argv.slice(2).join(" ").trim();

  if (!text) {
    console.error("Usage: npm start -- <text>");
    process.exitCode = 1;
    return;
  }

  const speaker = new TtsSpeaker({
    provider: new VoicevoxProvider({
      fallbackSpeaker: 3,
    }),
  });

  await speaker.speak(text);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
