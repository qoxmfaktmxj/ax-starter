export const appearanceCookie = "ax-appearance";
export type Appearance = {
  theme: "cobalt" | "isu";
  mode: "light" | "dark";
};

export function readAppearance(value?: string): Appearance {
  const [theme, mode, ...rest] = value?.split(".") ?? [];
  if (
    (theme === "cobalt" || theme === "isu") &&
    (mode === "light" || mode === "dark") &&
    rest.length === 0
  )
    return { theme, mode };
  return { theme: "cobalt", mode: "light" };
}
