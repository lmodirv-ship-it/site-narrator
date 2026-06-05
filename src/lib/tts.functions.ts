import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  text: z.string().min(1).max(8000),
  lang: z.string().min(2).max(10).optional(),
  voiceId: z.string().min(4).max(64).optional(),
});

// Map language → recommended ElevenLabs voice (multilingual_v2 supports them all)
function pickVoice(lang?: string, override?: string): string {
  if (override) return override;
  // Default: Sarah (warm, natural). Works well for AR/EN/FR/ES etc with multilingual model.
  return "EXAVITQu4vr4xnSDxMaL";
}

function bytesToBase64(bytes: Uint8Array): string {
  // Buffer is available in the Worker runtime via nodejs_compat
  // and avoids stack overflow on large audio.
  // @ts-ignore
  return Buffer.from(bytes).toString("base64");
}

export const synthesizeSpeech = createServerFn({ method: "POST" })
  .inputValidator(InputSchema)
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ElevenLabs is not connected. Please connect it in Connectors.");
    }

    const voiceId = pickVoice(data.lang, data.voiceId);

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.35,
            use_speaker_boost: true,
            speed: 1.0,
          },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`ElevenLabs TTS failed (${res.status}): ${err.slice(0, 300)}`);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      mimeType: "audio/mpeg",
      base64: bytesToBase64(buf),
    };
  });
