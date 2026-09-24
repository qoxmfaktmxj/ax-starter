import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(".");
const entryPoints = ["apps", "packages", "scripts"];
const sourceFiles: string[] = [];

async function walk(path: string): Promise<void> {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const next = join(path, item.name);
    if (item.isDirectory() && [".next", "node_modules"].includes(item.name))
      continue;
    if (item.isDirectory()) await walk(next);
    else if (/\.(ts|tsx)$/.test(item.name)) sourceFiles.push(next);
  }
}

for (const entry of entryPoints) await walk(join(root, entry));
const violations: string[] = [];
const imports = /(?:import|export)\s+(?:[^'"`]+?\s+from\s+)?['"]([^'"]+)['"]/g;

for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  const name = relative(root, file).replaceAll("\\", "/");
  for (const match of source.matchAll(imports)) {
    const target = match[1];
    const resolved = target.startsWith(".")
      ? relative(root, resolve(file, "..", target)).replaceAll("\\", "/")
      : target.replace(/^@\//, "");
    const restricted =
      /ag-grid-enterprise|@ag-grid-enterprise/.test(target) ||
      (name.startsWith("packages/contracts/") &&
        /(packages\/(server|grid)|apps\/|next|drizzle|ag-grid)/.test(
          resolved,
        )) ||
      (name.startsWith("packages/core/") &&
        /(packages\/server|apps\/|next|drizzle|ag-grid)/.test(resolved)) ||
      (name.startsWith("packages/ui/") &&
        /(packages\/(server|grid)|apps\/|next|drizzle|ag-grid)/.test(
          resolved,
        )) ||
      (name.startsWith("packages/grid/") &&
        /(packages\/server|apps\/|next|drizzle)/.test(resolved)) ||
      (name.startsWith("apps/worker/") && /next/.test(resolved)) ||
      (name.endsWith("/page.tsx") &&
        /(packages\/server|drizzle|node-postgres|pg-boss)/.test(resolved));
    if (restricted) violations.push(`${name}: ${target}`);
  }
}

const manifest = await readFile(join(root, "pnpm-lock.yaml"), "utf8");
if (/ag-grid-enterprise|@ag-grid-enterprise/.test(manifest))
  violations.push("pnpm-lock.yaml: Enterprise dependency");
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Architecture boundaries passed for ${sourceFiles.length} source files`,
  );
