import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSingleRenderer,
  assessPerformance,
  classifyConsole,
  fixtureMarkers,
  labelProblems,
  median,
  parseSpatialArgs,
  withFixturePlacements,
} from "../lib/spatial-ui.mjs";

const prefs = (spatial) =>
  JSON.stringify({ schemaVersion: 3, profiles: { demo: { spatial } } });
const samplePlan = {
  source: "sample",
  floors: [
    {
      id: "floor-1",
      rooms: [
        { id: "room-a", label: { x: 2, z: 3 } },
        { id: "room-b", label: { x: 6, z: 3 } },
      ],
    },
    {
      id: "floor-2",
      rooms: [{ id: "room-c", label: { x: 1, z: 1 } }],
    },
  ],
};

test("spatial runner options are explicit and performance needs local Chrome", () => {
  assert.deepEqual(parseSpatialArgs([]), {
    headed: false,
    performance: false,
  });
  assert.deepEqual(parseSpatialArgs(["--headed", "--performance"]), {
    headed: true,
    performance: true,
  });
  assert.throws(() => parseSpatialArgs(["--performance"]), /requires/);
  assert.throws(() => parseSpatialArgs(["--private"]), /Unknown/);
});

test("fixture placements require the public sample and replace only placements", () => {
  const raw = prefs({
    plan: samplePlan,
    placements: { "demo-sensor.old": {} },
    areaLinks: { "room-a": "area" },
  });
  const { value, floor, floors } = withFixturePlacements(raw);
  const next = JSON.parse(value);
  assert.deepEqual(floor, { id: "floor-1", rooms: ["room-a", "room-b"] });
  assert.deepEqual(floors, [floor, { id: "floor-2", rooms: ["room-c"] }]);
  assert.deepEqual(Object.keys(next.profiles.demo.spatial.placements), [
    ...fixtureMarkers,
  ]);
  assert.deepEqual(next.profiles.demo.spatial.placements[fixtureMarkers[1]], {
    floorId: "floor-1",
    roomId: "room-b",
    position: { x: 6, z: 3 },
  });
  assert.deepEqual(next.profiles.demo.spatial.areaLinks, { "room-a": "area" });
  assert.throws(
    () =>
      withFixturePlacements(
        prefs({ plan: { ...samplePlan, source: "reference_image" } }),
      ),
    /public sample/,
  );
  assert.throws(() => withFixturePlacements("{"), /readable/);
  assert.throws(
    () =>
      withFixturePlacements(JSON.stringify({ schemaVersion: 2, profiles: {} })),
    /schema 3/,
  );
});

test("only deliberately provoked WebGL messages are tolerated", () => {
  const lost = { type: "log", text: "THREE.WebGLRenderer: Context Lost." };
  const extension = {
    type: "warning",
    text: "THREE.WebGLRenderer: WEBGL_lose_context extension not supported.",
  };
  assert.equal(classifyConsole(lost), "unexpected");
  assert.equal(classifyConsole(extension), "unexpected");
  const provoked = new Set(["context-loss"]);
  assert.equal(classifyConsole(lost, provoked), "provoked");
  assert.equal(classifyConsole(extension, provoked), "provoked");
  assert.equal(
    classifyConsole(
      {
        type: "warning",
        text: "[.WebGL-0x1140043f000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels",
      },
      provoked,
    ),
    "driver",
  );
  for (const message of [
    { type: "error", text: "THREE.WebGLRenderer: Context Lost." },
    { type: "error", text: "Uncaught TypeError" },
    { type: "pageerror", text: "boom" },
    { type: "warning", text: "GL Driver Message (OpenGL, Error, 1)" },
  ])
    assert.equal(classifyConsole(message, provoked), "unexpected");
  assert.equal(classifyConsole({ type: "log", text: "ready" }), null);
});

test("performance budget fails closed on software GPU, slow openings or low FPS", () => {
  const passing = {
    gpu: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4)",
    opens: [120, 90, 3000],
    fps: [20, 31, 58],
    idleFrames: 0,
  };
  assert.equal(median(passing.fps), 31);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.deepEqual(assessPerformance(passing), {
    accepted: true,
    failures: [],
  });
  const failing = assessPerformance({
    gpu: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))",
    opens: [100, 3001],
    fps: [29, 29.9, 60],
    idleFrames: 1,
  });
  assert.equal(failing.accepted, false);
  assert.equal(failing.failures.length, 4);
});

test("renderer counters reject a second live renderer or inconsistent totals", () => {
  assertSingleRenderer({
    created: 7,
    disposed: 6,
    frames: 90,
    live: 1,
    peakLive: 1,
  });
  assert.throws(
    () =>
      assertSingleRenderer({
        created: 3,
        disposed: 1,
        frames: 1,
        live: 2,
        peakLive: 2,
      }),
    /At most one/,
  );
  assert.throws(
    () =>
      assertSingleRenderer({
        created: 3,
        disposed: 1,
        frames: 1,
        live: 1,
        peakLive: 1,
      }),
    /inconsistent/,
  );
});

test("visible marker labels stay inside the canvas and apart", () => {
  const size = { width: 320, height: 240 };
  const label = (x, y, visible = true) => ({ x, y, w: 80, h: 24, visible });
  assert.deepEqual(labelProblems([label(60, 40), label(200, 40)], size), []);
  assert.deepEqual(labelProblems([label(30, 40)], size), [
    "label 0 leaves the canvas",
  ]);
  assert.deepEqual(labelProblems([label(60, 40), label(100, 50)], size), [
    "labels 0 and 1 overlap",
  ]);
  // A label the layout chose to hide is not drawn, so it cannot collide.
  assert.deepEqual(
    labelProblems([label(60, 40), label(100, 50, false)], size),
    [],
  );
});
