import assert from "node:assert/strict";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { assertRuntimeMap, toolingOnly } from "./lib/runtime-dependencies.mjs";

const [directory, platform, ...rest] = process.argv.slice(2);
assert(
  directory && ["web", "android"].includes(platform) && !rest.length,
  "Usage: check-runtime-dependencies <export-directory> <web|android>",
);
const root = resolve(directory);
const files = [];
async function visit(path) {
  const info = await lstat(path);
  assert(!info.isSymbolicLink(), "Runtime export must not contain symlinks");
  if (info.isDirectory())
    for (const name of await readdir(path)) await visit(join(path, name));
  else if (path.endsWith(".map")) files.push(path);
}
await visit(root);
assert(
  files.some((file) => file.slice(root.length).split(sep).includes(platform)),
  "Expected platform source map missing; export with --source-maps",
);
let sources = 0;
for (const file of files)
  sources += assertRuntimeMap(JSON.parse(await readFile(file, "utf8")));
console.log(
  JSON.stringify({
    platform,
    maps: files.length,
    sources,
    excludedTooling: toolingOnly,
    result: "passed",
  }),
);
