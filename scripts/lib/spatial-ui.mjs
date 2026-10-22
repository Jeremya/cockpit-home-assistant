import assert from "node:assert/strict";

/** Expected UX06/UX08 model-camera limits, independent of the product source. */
const degrees = (value) => (value * Math.PI) / 180;
export const modelCamera = {
  yaw: degrees(35),
  minYaw: degrees(-5),
  maxYaw: degrees(75),
  minZoom: 1,
  maxZoom: 1.25,
};
export const performanceBudget = { openMs: 3000, medianFps: 30, idleFrames: 0 };
export const artifactBudgetBytes = 10 * 1024 * 1024;
export const spatialArtifacts = [
  "report.json",
  "failure.png",
  "home-3d-1440.png",
  "fallback-1440.png",
  "performance-1440.png",
  "zoom200.png",
];
// Two public demo entities, placed on the sample's first floor.
export const fixtureMarkers = [
  "demo-switch.living_lamp",
  "demo-lock.front_door",
];

export function parseSpatialArgs(args) {
  const known = new Set(["--headed", "--performance"]);
  const unknown = args.filter((arg) => !known.has(arg));
  if (unknown.length) throw new Error("Unknown spatial UI option");
  const headed = args.includes("--headed");
  const performance = args.includes("--performance");
  if (performance && !headed)
    throw new Error("--performance requires --headed local Chrome");
  return { headed, performance };
}

/** Placements are injected through the normal preference file of an isolated
 * browser context; no product API is added for the test. */
export function withFixturePlacements(raw, keys = fixtureMarkers) {
  let file;
  try {
    file = JSON.parse(raw);
  } catch {
    throw new Error("Demo preferences are not readable JSON");
  }
  const spatial = file?.profiles?.demo?.spatial;
  assert.equal(file?.schemaVersion, 3, "Expected preference schema 3");
  assert.equal(
    spatial?.plan?.source,
    "sample",
    "Fixture requires the public sample plan",
  );
  const floor = spatial.plan.floors[0];
  assert(floor?.rooms.length >= keys.length, "Fixture floor needs rooms");
  const placements = Object.fromEntries(
    keys.map((key, index) => {
      const room = floor.rooms[index];
      return [
        key,
        { floorId: floor.id, roomId: room.id, position: { ...room.label } },
      ];
    }),
  );
  const next = structuredClone(file);
  next.profiles.demo.spatial.placements = placements;
  return {
    value: JSON.stringify(next),
    floor: { id: floor.id, rooms: floor.rooms.map((room) => room.id) },
  };
}

/** Separates deliberately provoked WebGL messages from everything else. */
export function classifyConsole({ type, text }, provoked = new Set()) {
  if (type === "pageerror") return "unexpected";
  if (type === "log" && text === "THREE.WebGLRenderer: Context Lost.")
    return provoked.has("context-loss") ? "provoked" : "unexpected";
  if (
    type === "warning" &&
    text === "THREE.WebGLRenderer: WEBGL_lose_context extension not supported."
  )
    return provoked.has("context-loss") ? "provoked" : "unexpected";
  // Chromium's GL driver performance notices (for example SwiftShader readbacks).
  if (
    type === "warning" &&
    /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \([^,]+, Performance, /.test(
      text,
    )
  )
    return "driver";
  if (type === "error" || type === "warning") return "unexpected";
  return null;
}

export function median(values) {
  assert(values.length, "Median requires values");
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function assessPerformance({ gpu, opens, fps, idleFrames }) {
  const failures = [];
  if (!gpu || /swiftshader|llvmpipe|software|basic render/i.test(gpu))
    failures.push("hardware GPU required");
  if (opens.length !== 3 || opens.some((ms) => ms > performanceBudget.openMs))
    failures.push(`three openings within ${performanceBudget.openMs} ms`);
  if (fps.length !== 3 || median(fps) < performanceBudget.medianFps)
    failures.push(`median interaction >= ${performanceBudget.medianFps} FPS`);
  if (idleFrames !== performanceBudget.idleFrames)
    failures.push("no frames while idle");
  return { accepted: failures.length === 0, failures };
}

export function assertSingleRenderer(counters) {
  assert(
    counters.peakLive <= 1,
    `At most one web renderer may be alive (peak ${counters.peakLive})`,
  );
  assert.equal(
    counters.live,
    counters.created - counters.disposed,
    "Renderer counters are inconsistent",
  );
}
