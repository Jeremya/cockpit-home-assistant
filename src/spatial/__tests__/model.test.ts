import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import sample from "../sample-plan.json";
import { parseHousePlan, pointInPolygon } from "../model";

test("the public sample has unique spaces on three floors and no device placements", () => {
  const plan = parseHousePlan(sample)!;
  expect(plan.floors).toHaveLength(3);
  expect(
    new Set(plan.floors.flatMap((floor) => floor.rooms.map((room) => room.id)))
      .size,
  ).toBe(6);
  expect(plan.source).toBe("sample");
  expect(plan).not.toHaveProperty("placements");
});

test("concave-room picking respects the cutout and its boundary", () => {
  const polygon = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 2 },
    { x: 2, z: 2 },
    { x: 2, z: 4 },
    { x: 0, z: 4 },
  ];
  expect(pointInPolygon({ x: 1, z: 3 }, polygon)).toBe(true);
  expect(pointInPolygon({ x: 3, z: 3 }, polygon)).toBe(false);
  expect(pointInPolygon({ x: 2, z: 3 }, polygon)).toBe(true);
});

test("invalid geometry, duplicate identities and unsupported schemas cannot be bundled", () => {
  const invalid = structuredClone(sample);
  invalid.floors[0]!.rooms[0]!.polygon[0]!.x = Number.NaN;
  expect(parseHousePlan(invalid)).toBeNull();
  const duplicate = structuredClone(sample);
  duplicate.floors[1]!.rooms[0]!.id = duplicate.floors[0]!.rooms[0]!.id;
  expect(parseHousePlan(duplicate)).toBeNull();
  const outside = structuredClone(sample);
  outside.floors[0]!.rooms[0]!.polygon[0]!.x = -50;
  expect(parseHousePlan(outside)).toBeNull();
  expect(parseHousePlan({ ...sample, schemaVersion: 20 })).toBeNull();
});

test("a clean build uses the public sample; invalid local data preserves the previous bundle", () => {
  const temporary = mkdtempSync(join(tmpdir(), "cockpit-plan-"));
  const source = join(temporary, "personal.json");
  const output = join(temporary, "bundle.json");
  const prepare = () =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/prepare-house-plan.ts"],
      {
        cwd: resolve("."),
        env: {
          ...process.env,
          COCKPIT_PLAN_FILE: source,
          COCKPIT_PLAN_OUTPUT: output,
        },
        encoding: "utf8",
      },
    );
  try {
    expect(prepare().status).toBe(0);
    const before = readFileSync(output, "utf8");
    expect(JSON.parse(before).id).toBe("sample-home");
    writeFileSync(source, '{"private-invalid-data":"do-not-print-this"}');
    const failure = prepare();
    expect(failure.status).toBe(1);
    expect(failure.stderr).not.toContain("do-not-print-this");
    expect(readFileSync(output, "utf8")).toBe(before);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
