import { z } from "zod";

export const homeModes = ["portal", "work"] as const;
export type HomeMode = (typeof homeModes)[number];
export const homeModeUpdate = z.strictObject({ mode: z.enum(homeModes) });
