import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseHousePlan } from "../src/spatial/model";

async function main() {
  const local = resolve(
    process.env.COCKPIT_PLAN_FILE ?? ".local/home-plan.json",
  );
  let raw: string;
  let source = "local";
  try {
    raw = await readFile(local, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    raw = await readFile(resolve("src/spatial/sample-plan.json"), "utf8");
    source = "sample";
  }
  const plan = parseHousePlan(JSON.parse(raw));
  if (!plan)
    throw new Error("Invalid house plan. Check its schema, IDs and polygons.");
  const target = resolve(
    process.env.COCKPIT_PLAN_OUTPUT ?? "src/spatial/current-plan.json",
  );
  await mkdir(dirname(target), { recursive: true });
  const content = JSON.stringify(plan, null, 2) + "\n";
  let previous: string | undefined;
  try {
    previous = await readFile(target, "utf8");
  } catch {
    /* First preparation. */
  }
  if (previous !== content) await writeFile(target, content, { mode: 0o600 });
  console.log(
    `Prepared ${source} house plan. Personal geometry stays in ignored build files.`,
  );
}
main().catch(() => {
  console.error(
    "House plan preparation failed. Check .local/home-plan.json; no personal data was printed.",
  );
  process.exitCode = 1;
});
