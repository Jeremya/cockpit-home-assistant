import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("installed xcode consumer keeps project IDs and parse/write behavior with patched uuid", async () => {
  const require = createRequire(import.meta.url);
  const xcode = require("xcode");
  const consumer = createRequire(require.resolve("xcode"));
  assert.equal(
    JSON.parse(await readFile(consumer.resolve("uuid/package.json"))).version,
    "11.1.1",
  );
  const uuid = consumer("uuid");
  assert.throws(
    () => uuid.v5("test", uuid.v5.DNS, new Uint8Array(1)),
    RangeError,
  );
  const folder = await mkdtemp(join(tmpdir(), "maurice-xcode-uuid-"));
  try {
    const file = join(folder, "project.pbxproj");
    await writeFile(
      file,
      `// !$*UTF8*$!\n{
      archiveVersion = 1; classes = {}; objectVersion = 56;
      objects = {
        /* Begin PBXGroup section */
        AAAAAAAAAAAAAAAAAAAAAAAA = {isa = PBXGroup; children = (); sourceTree = "<group>";};
        /* End PBXGroup section */
        /* Begin PBXFileReference section */
        /* End PBXFileReference section */
      }; rootObject = AAAAAAAAAAAAAAAAAAAAAAAA;
    }\n`,
    );
    const project = xcode.project(file).parseSync();
    const ids = new Set(
      Array.from({ length: 100 }, () => project.generateUuid()),
    );
    assert.equal(ids.size, 100);
    for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
    const group = project.addPbxGroup([], "Maurice", "Maurice");
    assert.match(group.uuid, /^[A-F0-9]{24}$/);
    await writeFile(file, project.writeSync());
    const parsed = xcode.project(file).parseSync();
    assert.equal(
      parsed.hash.project.objects.PBXGroup[group.uuid].name,
      "Maurice",
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
