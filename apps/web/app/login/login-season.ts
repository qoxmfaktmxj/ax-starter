import seasons from "./login-seasons.json";

// 계절별 큐브 모양과 장식은 login-seasons.json 하나가 정한다 (Blender 렌더와 같이 읽는다).
export type LoginSeason = keyof typeof seasons;

const SEASON_ORDER = Object.keys(seasons) as LoginSeason[];

/** 확인용 배경을 순서대로 전환하고 연말 다음에는 새해로 돌아간다. */
export function nextLoginSeason(season: LoginSeason): LoginSeason {
  return SEASON_ORDER[
    (SEASON_ORDER.indexOf(season) + 1) % SEASON_ORDER.length
  ]!;
}

const SEOUL = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function seoulDate(date: Date) {
  const parts = Object.fromEntries(
    SEOUL.formatToParts(date).map((part) => [part.type, Number(part.value)]),
  );
  return { year: parts.year!, month: parts.month!, day: parts.day! };
}

/** 한국 시간 날짜로 로그인 화면의 계절을 정한다. */
export function loginSeason(date: Date): LoginSeason {
  const { month, day } = seoulDate(date);
  if (month === 1) return "newyear";
  if (month === 2) return "ice";
  if (month <= 4) return "blossom";
  if (month === 5 || month === 9) return "green";
  if (month <= 8) return "summer";
  if (month <= 11) return "autumn";
  return day <= 25 ? "christmas" : "yearend";
}

/** 1월과 연말에만 큐브 옆에 띄우는 인사말. */
export function seasonPhrase(season: LoginSeason, date: Date): string | null {
  const phrase = (seasons[season] as { phrase?: string }).phrase;
  return phrase
    ? phrase.replace("{nextYear}", String(seoulDate(date).year + 1))
    : null;
}

export function parseSeason(
  value: string | string[] | undefined,
): LoginSeason | null {
  return typeof value === "string" && Object.hasOwn(seasons, value)
    ? (value as LoginSeason)
    : null;
}
