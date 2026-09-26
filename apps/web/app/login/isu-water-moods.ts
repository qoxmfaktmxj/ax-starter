export const MOOD_ORDER = ["10", "06", "05", "04", "09", "08"] as const;
export type MoodId = (typeof MOOD_ORDER)[number];
export type MoodPhase = "hold" | "transition";
export type MoodTimeline = { mood: MoodId; phase: MoodPhase; elapsed: number };

export const HOLD_SECONDS = 45;
export const TRANSITION_SECONDS = 15;

export const MOODS: Record<
  MoodId,
  {
    sky: string;
    horizon: string;
    water: string;
    sun: string;
    power: number;
    ambient: number;
    exposure: number;
    rain: number;
    wave: number;
    haze: number;
  }
> = {
  "10": {
    sky: "#babac2",
    horizon: "#f0e6e0",
    water: "#879da4",
    sun: "#ffe5da",
    power: 1.1,
    ambient: 1.85,
    exposure: 1.04,
    rain: 0,
    wave: 0.075,
    haze: 0.005,
  },
  "06": {
    sky: "#408f94",
    horizon: "#a0c7bc",
    water: "#075568",
    sun: "#c9ffeb",
    power: 1.55,
    ambient: 1.7,
    exposure: 0.98,
    rain: 0,
    wave: 0.19,
    haze: 0.004,
  },
  "05": {
    sky: "#7d879f",
    horizon: "#ffc7a0",
    water: "#3b6373",
    sun: "#ff9b57",
    power: 1.8,
    ambient: 1.65,
    exposure: 1.01,
    rain: 0,
    wave: 0.13,
    haze: 0.005,
  },
  "04": {
    sky: "#7771a1",
    horizon: "#dbb5c5",
    water: "#555a85",
    sun: "#ffb7c4",
    power: 0.8,
    ambient: 1.72,
    exposure: 1,
    rain: 0,
    wave: 0.09,
    haze: 0.006,
  },
  "09": {
    sky: "#405766",
    horizon: "#899da6",
    water: "#1c3647",
    sun: "#c1e0f2",
    power: 0.7,
    ambient: 1.55,
    exposure: 0.98,
    rain: 1,
    wave: 0.25,
    haze: 0.01,
  },
  "08": {
    sky: "#061323",
    horizon: "#193b52",
    water: "#071624",
    sun: "#9fd8ff",
    power: 0.38,
    ambient: 0.97,
    exposure: 1,
    rain: 0,
    wave: 0.045,
    haze: 0.003,
  },
};

export function randomMood(random = Math.random): MoodId {
  return MOOD_ORDER[Math.min(5, Math.max(0, Math.floor(random() * 6)))];
}

export function nextMood(mood: MoodId): MoodId {
  return MOOD_ORDER[(MOOD_ORDER.indexOf(mood) + 1) % MOOD_ORDER.length];
}

export function smooth(progress: number) {
  const x = Math.max(0, Math.min(1, progress));
  return x * x * (3 - 2 * x);
}

export function transitionStops(
  from: MoodId,
  progress: number,
): { from: MoodId; to: MoodId; mix: number } {
  const to = nextMood(from);
  const t = Math.max(0, Math.min(1, progress));
  if (from === "08") {
    return t < 0.5
      ? { from: "08", to: "04", mix: smooth(t * 2) }
      : { from: "04", to: "10", mix: smooth((t - 0.5) * 2) };
  }
  return { from, to, mix: smooth(t) };
}

export function advanceMood(
  state: MoodTimeline,
  seconds: number,
): MoodTimeline {
  let { mood, phase, elapsed } = state;
  elapsed += Math.max(0, seconds);
  while (elapsed >= (phase === "hold" ? HOLD_SECONDS : TRANSITION_SECONDS)) {
    elapsed -= phase === "hold" ? HOLD_SECONDS : TRANSITION_SECONDS;
    if (phase === "hold") phase = "transition";
    else {
      mood = nextMood(mood);
      phase = "hold";
    }
  }
  return { mood, phase, elapsed };
}
