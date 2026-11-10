export const appearanceCookie = "ax-appearance";
export type Appearance = {
  theme: "cobalt" | "isu";
  mode: "light" | "dark";
  density: "default" | "compact";
};

export function readAppearance(value?: string): Appearance {
  const [theme, mode, density = "default", ...rest] = value?.split(".") ?? [];
  if (
    (theme === "cobalt" || theme === "isu") &&
    (mode === "light" || mode === "dark") &&
    (density === "default" || density === "compact") &&
    rest.length === 0
  )
    return { theme, mode, density };
  return { theme: "cobalt", mode: "light", density: "default" };
}
