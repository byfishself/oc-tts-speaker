import { createServer } from "node:http";
import { TtsSpeaker } from "./speaker.js";
import { VoicevoxProvider } from "./tts/voicevox.js";

const PORT = 18790;

const speaker = new TtsSpeaker({
  provider: new VoicevoxProvider({
    fallbackSpeaker: 3,
  }),
});

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/speak") {
    res.writeHead(404, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  try {
    const body = await readBody(req);
    const data = JSON.parse(body) as { text?: unknown };

    if (typeof data.text !== "string" || !data.text.trim()) {
      res.writeHead(400, {
        "Content-Type": "application/json",
      });

      res.end(JSON.stringify({ error: "text is required" }));
      return;
    }

    await speaker.speak(data.text);

    res.writeHead(200, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error(error);

    res.writeHead(500, {
      "Content-Type": "application/json",
    });

    res.end(JSON.stringify({ error: "TTS playback failed" }));
  }
});

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      resolve(body);
    });

    req.on("error", reject);
  });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TTS Speaker listening on http://127.0.0.1:${PORT}`);
});
