// 20 voice presets — combinations of language accent + pitch (semitones) + speed
// + audio coloring (EQ filters) to push perceived timbre apart even though
// Google TTS only ships one voice per language.
export type VoicePreset = {
  id: string;
  name: string;
  lang: string;      // Google TTS language code
  pitch: number;     // semitones (-12..+12), applied via AudioBufferSourceNode.detune
  speed: number;     // playbackRate (0.7..1.4)
  gender: "female" | "male" | "neutral";
  // Optional EQ chain (Web Audio BiquadFilter) to color the timbre.
  highpass?: number; // Hz, cuts lows
  lowpass?: number;  // Hz, cuts highs
  peakFreq?: number; // Hz, mid emphasis
  peakGain?: number; // dB
  peakQ?: number;
};

export const VOICE_PRESETS: VoicePreset[] = [
  // Arabic — Google has one voice; we shift pitch + EQ to differentiate.
  { id: "ar-f-warm",   name: "أنثوي دافئ (عربي)",    lang: "ar",    pitch: 3,  speed: 1.0,  gender: "female", highpass: 220, lowpass: 7000, peakFreq: 2200, peakGain: 3,  peakQ: 1.0 },
  { id: "ar-f-bright", name: "أنثوي مشرق (عربي)",    lang: "ar",    pitch: 5,  speed: 1.07, gender: "female", highpass: 280, lowpass: 9500, peakFreq: 3800, peakGain: 5,  peakQ: 1.2 },
  { id: "ar-f-soft",   name: "أنثوي ناعم (عربي)",    lang: "ar",    pitch: 2,  speed: 0.92, gender: "female", highpass: 180, lowpass: 5800, peakFreq: 1500, peakGain: 2,  peakQ: 0.9 },
  { id: "ar-m-deep",   name: "ذكوري عميق (عربي)",    lang: "ar",    pitch: -6, speed: 0.9,  gender: "male",   highpass: 70,  lowpass: 4200, peakFreq: 250,  peakGain: 5,  peakQ: 0.9 },
  { id: "ar-m-news",   name: "ذكوري إخباري (عربي)",  lang: "ar",    pitch: -3, speed: 1.0,  gender: "male",   highpass: 110, lowpass: 6500, peakFreq: 1800, peakGain: 4,  peakQ: 1.1 },
  { id: "ar-m-young",  name: "ذكوري شبابي (عربي)",   lang: "ar",    pitch: -1, speed: 1.12, gender: "male",   highpass: 140, lowpass: 8000, peakFreq: 2600, peakGain: 3,  peakQ: 1.0 },
  { id: "ar-n-narr",   name: "راوي محايد (عربي)",    lang: "ar",    pitch: -2, speed: 1.0,  gender: "neutral",highpass: 100, lowpass: 7500, peakFreq: 1200, peakGain: 2,  peakQ: 0.8 },

  // English uses different TLDs/accents which DO produce different voices in Google TTS.
  { id: "en-f-us", name: "Female US",   lang: "en",    pitch: 3,  speed: 1.0,  gender: "female", highpass: 220, lowpass: 8500, peakFreq: 3000, peakGain: 4, peakQ: 1.1 },
  { id: "en-f-uk", name: "Female UK",   lang: "en-GB", pitch: 4,  speed: 1.0,  gender: "female", highpass: 240, lowpass: 9000, peakFreq: 3500, peakGain: 4, peakQ: 1.2 },
  { id: "en-f-au", name: "Female AU",   lang: "en-AU", pitch: 3,  speed: 1.03, gender: "female", highpass: 230, lowpass: 8800, peakFreq: 3200, peakGain: 4, peakQ: 1.1 },
  { id: "en-m-us", name: "Male US",     lang: "en",    pitch: -4, speed: 0.96, gender: "male",   highpass: 90,  lowpass: 5500, peakFreq: 900,  peakGain: 4, peakQ: 1.0 },
  { id: "en-m-uk", name: "Male UK",     lang: "en-GB", pitch: -5, speed: 0.95, gender: "male",   highpass: 80,  lowpass: 5200, peakFreq: 700,  peakGain: 4, peakQ: 1.0 },
  { id: "en-m-deep",  name: "Male Deep",  lang: "en", pitch: -8, speed: 0.9,  gender: "male",   highpass: 60,  lowpass: 4000, peakFreq: 220,  peakGain: 6, peakQ: 0.9 },
  { id: "en-m-young", name: "Male Young", lang: "en", pitch: 0,  speed: 1.1,  gender: "male",   highpass: 150, lowpass: 7500, peakFreq: 2400, peakGain: 3, peakQ: 1.0 },

  { id: "fr-f", name: "Féminin Français",   lang: "fr", pitch: 3,  speed: 1.0,  gender: "female", highpass: 230, lowpass: 8500, peakFreq: 3000, peakGain: 4, peakQ: 1.1 },
  { id: "fr-m", name: "Masculin Français",  lang: "fr", pitch: -4, speed: 0.96, gender: "male",   highpass: 90,  lowpass: 5500, peakFreq: 900,  peakGain: 4, peakQ: 1.0 },
  { id: "es-f", name: "Femenino Español",   lang: "es", pitch: 3,  speed: 1.0,  gender: "female", highpass: 230, lowpass: 8500, peakFreq: 3000, peakGain: 4, peakQ: 1.1 },
  { id: "es-m", name: "Masculino Español",  lang: "es", pitch: -4, speed: 0.96, gender: "male",   highpass: 90,  lowpass: 5500, peakFreq: 900,  peakGain: 4, peakQ: 1.0 },
  { id: "de-f", name: "Weiblich Deutsch",   lang: "de", pitch: 2,  speed: 1.0,  gender: "female", highpass: 220, lowpass: 8200, peakFreq: 2800, peakGain: 4, peakQ: 1.1 },
  { id: "de-m", name: "Männlich Deutsch",   lang: "de", pitch: -5, speed: 0.95, gender: "male",   highpass: 80,  lowpass: 5200, peakFreq: 800,  peakGain: 5, peakQ: 1.0 },
];
