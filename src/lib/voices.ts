// 20 voice presets — combinations of language accent + pitch (semitones) + speed
export type VoicePreset = {
  id: string;
  name: string;
  lang: string;      // Google TTS language code
  pitch: number;     // semitones (-12..+12), applied via AudioBufferSourceNode.detune
  speed: number;     // playbackRate (0.7..1.4)
  gender: "female" | "male" | "neutral";
};

export const VOICE_PRESETS: VoicePreset[] = [
  { id: "ar-f-warm",    name: "أنثوي دافئ (عربي)",     lang: "ar",    pitch: 2,  speed: 1.0, gender: "female" },
  { id: "ar-f-bright",  name: "أنثوي مشرق (عربي)",     lang: "ar",    pitch: 4,  speed: 1.05, gender: "female" },
  { id: "ar-f-soft",    name: "أنثوي ناعم (عربي)",     lang: "ar",    pitch: 3,  speed: 0.95, gender: "female" },
  { id: "ar-m-deep",    name: "ذكوري عميق (عربي)",     lang: "ar",    pitch: -4, speed: 0.95, gender: "male" },
  { id: "ar-m-news",    name: "ذكوري إخباري (عربي)",   lang: "ar",    pitch: -2, speed: 1.0, gender: "male" },
  { id: "ar-m-young",   name: "ذكوري شبابي (عربي)",    lang: "ar",    pitch: 0,  speed: 1.1, gender: "male" },
  { id: "ar-n-narr",    name: "راوي محايد (عربي)",     lang: "ar",    pitch: -1, speed: 1.0, gender: "neutral" },
  { id: "en-f-us",      name: "Female US",              lang: "en",    pitch: 2,  speed: 1.0, gender: "female" },
  { id: "en-f-uk",      name: "Female UK",              lang: "en-GB", pitch: 3,  speed: 1.0, gender: "female" },
  { id: "en-f-au",      name: "Female AU",              lang: "en-AU", pitch: 2,  speed: 1.0, gender: "female" },
  { id: "en-m-us",      name: "Male US",                lang: "en",    pitch: -3, speed: 0.98, gender: "male" },
  { id: "en-m-uk",      name: "Male UK",                lang: "en-GB", pitch: -4, speed: 0.97, gender: "male" },
  { id: "en-m-deep",    name: "Male Deep",              lang: "en",    pitch: -6, speed: 0.93, gender: "male" },
  { id: "en-m-young",   name: "Male Young",             lang: "en",    pitch: 1,  speed: 1.08, gender: "male" },
  { id: "fr-f",         name: "Féminin Français",       lang: "fr",    pitch: 2,  speed: 1.0, gender: "female" },
  { id: "fr-m",         name: "Masculin Français",      lang: "fr",    pitch: -3, speed: 0.98, gender: "male" },
  { id: "es-f",         name: "Femenino Español",       lang: "es",    pitch: 2,  speed: 1.0, gender: "female" },
  { id: "es-m",         name: "Masculino Español",      lang: "es",    pitch: -3, speed: 0.98, gender: "male" },
  { id: "de-f",         name: "Weiblich Deutsch",       lang: "de",    pitch: 1,  speed: 1.0, gender: "female" },
  { id: "de-m",         name: "Männlich Deutsch",       lang: "de",    pitch: -4, speed: 0.97, gender: "male" },
];
