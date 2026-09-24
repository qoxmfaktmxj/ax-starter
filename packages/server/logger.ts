import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "*.accessToken",
    "*.refreshToken",
    "*.idToken",
    "*.password",
    "*.monthlySalary",
    "*.body",
  ],
});
