export const MOOD_ORDER = ["06", "10", "05", "04", "09", "08"] as const;
export type MoodId = (typeof MOOD_ORDER)[number];
export type MoodPhase = "hold" | "transition";
export type MoodTimeline = { mood: MoodId; phase: MoodPhase; elapsed: number };

export const HOLD_SECONDS = 15;
export const TRANSITION_SECONDS = 5;

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
    sunset: number;
  }
> = {
  "10": {
    sky: "#65b1d0",
    horizon: "#d7e8e9",
    water: "#27738b",
    sun: "#fff2d1",
    power: 1.1,
    ambient: 1.85,
    exposure: 1.04,
    rain: 0,
    wave: 0.065,
    haze: 0.005,
    sunset: 0,
  },
  "06": {
    sky: "#408f94",
    horizon: "#a0c7bc",
    water: "#075568",
    sun: "#ffd9a7",
    power: 1.55,
    ambient: 1.7,
    exposure: 0.98,
    rain: 0,
    wave: 0.16,
    haze: 0.004,
    sunset: 0,
  },
  "05": {
    sky: "#5f2939",
    horizon: "#dd7844",
    water: "#43313d",
    sun: "#ffb46c",
    power: 1.5,
    ambient: 1.28,
    exposure: 0.96,
    rain: 0,
    wave: 0.12,
    haze: 0.004,
    sunset: 1,
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
    wave: 0.075,
    haze: 0.006,
    sunset: 0,
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
    wave: 0.21,
    haze: 0.01,
    sunset: 0,
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
    wave: 0.04,
    haze: 0.003,
    sunset: 0,
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
  return { from, to, mix: smooth(t) };
}

export function sunArc(state: MoodTimeline) {
  const phaseTime =
    state.elapsed + (state.phase === "transition" ? HOLD_SECONDS : 0);
  const moodIndex = MOOD_ORDER.indexOf(state.mood);
  let cycleTime: number;
  if (moodIndex < 3)
    cycleTime = moodIndex * (HOLD_SECONDS + TRANSITION_SECONDS) + phaseTime + 3;
  else if (state.mood === "08" && state.phase === "transition")
    cycleTime = (state.elapsed / TRANSITION_SECONDS) * 3;
  else return { x: 0, height: -0.13, strength: 0, active: false };
  const progress = Math.min(
    1,
    cycleTime / ((HOLD_SECONDS + TRANSITION_SECONDS) * 3),
  );
  const height = -0.13 + 0.34 * Math.sin(Math.PI * progress);
  return {
    x: -0.18 + 0.42 * progress,
    height,
    strength: smooth((height + 0.1) / 0.15),
    active: true,
  };
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
