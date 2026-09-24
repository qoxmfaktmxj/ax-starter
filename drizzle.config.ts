import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./packages/server/db/schema.ts', './packages/server/auth/auth-schema.ts'],
  out: './packages/server/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://ax:ax@localhost:5432/ax_local' },
});
