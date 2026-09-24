const url = new URL(process.env.DATABASE_URL ?? "");
if (url.pathname !== "/ax_integration" || process.env.APP_PROFILE !== "test") {
  throw new Error(
    "Integration tests require the isolated ax_integration database in test profile",
  );
}
