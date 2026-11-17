import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import {
  assertPublicPlan,
  copyPublicSource,
  publicEnvironment,
  run,
} from "./lib/public-build.mjs";
import { previewServer } from "./lib/preview-server.mjs";
import {
  artifactBudgetBytes,
  assertSingleRenderer,
  assessPerformance,
  classifyConsole,
  fixtureMarkers,
  labelProblems,
  median,
  modelCamera,
  parseSpatialArgs,
  spatialArtifacts,
  withFixturePlacements,
} from "./lib/spatial-ui.mjs";

const options = parseSpatialArgs(process.argv.slice(2));
const root = process.cwd();
const output = join(root, "artifacts/spatial-ui");
const controller = new AbortController();
let browser, server, temporary, page;
let stage = "prepare";
let publicVerified = false;
const persistent = [];
const report = {
  schema: 1,
  mode: options.performance
    ? "headed-performance"
    : options.headed
      ? "headed"
      : "headless",
  publicSampleOnly: true,
  privatePlan: false,
  realHaRequired: false,
  physicalServiceCalls: 0,
  externalRequests: 0,
  console: { unexpectedCount: 0, unexpected: [], provoked: 0, driver: 0 },
  checks: {},
  result: "failed",
};
const originalPath = join(root, "src/spatial/current-plan.json");
const readOptional = (path) =>
  readFile(path).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const original = await readOptional(originalPath);
let checkoutBefore;
try {
  checkoutBefore = git(["status", "--porcelain"]);
} catch {
  checkoutBefore = null;
}
const stop = () => {
  controller.abort();
  void browser?.close();
  for (const context of persistent) void context.close();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const deadline = setTimeout(stop, 15 * 60_000);
const expect = playwrightExpect.configure({ timeout: 10_000 });
// The app bounds one furniture asset read at 15 s (src/web/assetBytes.ts).
const assetBoundMs = 15_000;
// Playwright would otherwise exit(130) on SIGINT before this runner's cleanup.
const ownSignals = {
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
};

const scene = (target) =>
  target.locator("[data-s01-scene]").filter({ visible: true });
const probe = (target) => scene(target).evaluate((node) => node.sceneProbe);
const counters = (target) =>
  target.evaluate(() =>
    JSON.parse(
      document.documentElement.dataset.mauriceRenderers ??
        '{"created":0,"disposed":0,"frames":0,"live":0,"peakLive":0}',
    ),
  );
const near = (actual, expected, label) =>
  assert(
    Math.abs(actual - expected) < 1e-6,
    `${label}: ${actual} != ${expected}`,
  );
const tab = (target, name) => target.getByRole("tab", { name, exact: true });
const settle = (target) =>
  target.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
/** One visible renderer, its first frame drawn, camera at rest. */
async function ready(target) {
  await expect
    .poll(() =>
      scene(target).evaluateAll(
        (nodes) => nodes.length === 1 && nodes[0].sceneProbe?.readyMs != null,
      ),
    )
    .toBe(true);
  await expect.poll(async () => (await counters(target)).live).toBe(1);
  await expect
    .poll(async () => (await probe(target)).animatedCamera)
    .toBe(false);
}
async function noScene(target) {
  await expect(scene(target)).toHaveCount(0);
  await expect.poll(async () => (await counters(target)).live).toBe(0);
}
async function noOverflow(target) {
  assert(
    await target.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Page must fit the viewport",
  );
}
/** Resizes, then lets the workspace re-measure: crossing the detail panel
 * threshold mounts Home elsewhere, with fresh local UI state. */
async function resize(target, width, height = 1000) {
  await target.setViewportSize({ width, height });
  await settle(target);
  await settle(target);
}
/** Waits for the compact disclosure, so a resize cannot race the check. */
async function expandCompactPlan(target) {
  const toggle = target.getByRole("button", {
    name: /^(Show|Hide) rooms on plan$/,
  });
  await expect(toggle).toBeVisible();
  if ((await toggle.textContent()).startsWith("Show")) await toggle.click();
  await expect(toggle).toHaveText("Hide rooms on plan");
}
async function demo(target) {
  await target
    .getByRole("button", { name: "Explore demo home", exact: true })
    .click();
  await expect(
    target.getByText("Maurice · demo home", { exact: true }),
  ).toBeVisible();
}
/** Keeps the failing page before its context closes. */
async function failureEvidence() {
  if (publicVerified && page && !page.isClosed())
    await page
      .screenshot({ path: join(output, "failure.png") })
      .catch(() => {});
}
/** Records external traffic and console output for one context. */
function observe(context, provoked) {
  const record = (type, text) => {
    const kind = classifyConsole({ type, text }, provoked);
    if (kind === "unexpected") {
      report.console.unexpectedCount++;
      if (report.console.unexpected.length < 10)
        report.console.unexpected.push(`${type}: ${text.slice(0, 500)}`);
    } else if (kind) report.console[kind]++;
  };
  context.on("page", (opened) => {
    opened.setDefaultTimeout(10_000);
    opened.on("pageerror", (error) => record("pageerror", error.message));
    opened.on("console", (message) => record(message.type(), message.text()));
  });
  return Promise.all([
    context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === server.origin)
        return route.continue();
      report.externalRequests++;
      return route.abort();
    }),
    context.routeWebSocket("**/*", (socket) => {
      report.externalRequests++;
      socket.close();
    }),
  ]);
}
/**
 * Holds one same-origin asset at the network layer: the browser keeps the
 * request open and never answers until `release()`, so the app sees a
 * transport that does not finish. Only that asset's URL is affected.
 */
async function holdAsset(context, pattern) {
  const control = { requests: 0, hold: true, held: [] };
  await context.route(pattern, (route) => {
    control.requests++;
    if (control.hold) control.held.push(route);
    else return route.fallback();
  });
  control.release = async () => {
    const held = control.held.splice(0);
    // A request the page already aborted can no longer be answered.
    for (const route of held) await route.fallback().catch(() => {});
    return held.length;
  };
  return control;
}
/** Fresh demo, then the same demo with two public placements on floor 1. */
async function fixtureContext(contextOptions) {
  const context = await browser.newContext({
    serviceWorkers: "block",
    ...contextOptions,
  });
  const provoked = new Set();
  await observe(context, provoked);
  page = await context.newPage();
  await page.goto(server.origin, { waitUntil: "networkidle" });
  await demo(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("prefs") ?? "null")?.profiles?.demo
            ?.spatial?.plan?.source ?? null,
      ),
    )
    .toBe("sample");
  const fixture = withFixturePlacements(
    await page.evaluate(() => localStorage.getItem("prefs")),
  );
  // One-shot: later navigations keep whatever the app itself persisted.
  await context.addInitScript((value) => {
    if (sessionStorage.getItem("maurice-spatial-fixture")) return;
    localStorage.setItem("prefs", value);
    sessionStorage.setItem("maurice-spatial-fixture", "installed");
  }, fixture.value);
  await page.reload({ waitUntil: "networkidle" });
  await demo(page);
  return {
    context,
    provoked,
    floor: fixture.floor,
    floors: fixture.floors,
  };
}
async function assertFixtureScene(target, floor) {
  const current = await probe(target);
  assert.deepEqual(
    current.rooms.map((room) => room.id),
    floor.rooms,
    "Scene must show the expected sample floor",
  );
  assert.deepEqual(
    current.markers.map((marker) => marker.key).toSorted(),
    fixtureMarkers.toSorted(),
    "Scene must show exactly the fixture markers",
  );
  return current;
}
/** Home may lay out in two passes after a resize; the fit must converge. */
async function cornersInside(target) {
  await expect
    .poll(
      async () => {
        const current = await probe(target);
        return current.floorCorners.every(
          (corner) =>
            corner.x > 0 &&
            corner.x < current.size.width &&
            corner.y > 0 &&
            corner.y < current.size.height,
        );
      },
      { message: "Floor outline must stay inside the canvas" },
    )
    .toBe(true);
}
/** Drawn marker labels stay inside the canvas and apart once the fit settles. */
async function labelsLegible(target) {
  await expect
    .poll(
      async () => {
        const current = await probe(target);
        return labelProblems(current.labels, current.size);
      },
      { message: "Marker labels must stay inside the canvas and apart" },
    )
    .toEqual([]);
}
const roomTabs = (plan) =>
  plan.getByRole("tab", { name: /^Select .+ on plan$/ });
/** Samples animatedCamera every frame while `action` runs. */
async function animationDuring(target, action) {
  const sampling = scene(target).evaluate(
    (node) =>
      new Promise((resolve) => {
        const seen = [];
        const started = performance.now();
        const tick = () => {
          seen.push(node.sceneProbe.animatedCamera);
          if (performance.now() - started < 600) requestAnimationFrame(tick);
          else resolve(seen);
        };
        tick();
      }),
  );
  await action();
  return (await sampling).some(Boolean);
}
const webglRenderer = (target) =>
  scene(target).evaluate((node) => {
    const gl = node.querySelector("canvas").getContext("webgl2");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return info
      ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
async function hideDocument(target, hidden) {
  await target.evaluate((value) => {
    if (value)
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
    else delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function functional() {
  const checks = report.checks;
  const { context, provoked, floor, floors } = await fixtureContext({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const plan = page.getByTestId("home-plan-overview");
    stage = "default-view";
    await expect(tab(plan, "3D view")).toHaveAttribute("aria-selected", "true");
    await ready(page);
    await expect(scene(page)).toHaveAttribute("data-camera-mode", "model");
    await assertFixtureScene(page, floor);
    // Headless CI normally reports a software renderer: functional, not GPU.
    report.browser.webglRenderer = await webglRenderer(page);
    // Every piece must end as its GLB model; a fallback volume means a load failed.
    await expect
      .poll(async () => (await probe(page)).furniture, {
        message: "Furniture must load as models, not fallback volumes",
      })
      .toMatchObject({ fallbacks: 0 });
    const { furniture } = await probe(page);
    assert(furniture.models > 0, "The sample floor must show furniture");
    await resize(page, 1024);
    await ready(page);
    await expect(scene(page)).toHaveAttribute("data-camera-mode", "model");
    await resize(page, 1023);
    await expandCompactPlan(page);
    await expect(tab(plan, "2D plan")).toHaveAttribute("aria-selected", "true");
    await noScene(page);
    await resize(page, 1440);
    await ready(page);
    checks.defaultView = {
      model3dAt: [1024, 1440],
      compact2dAt: 1023,
      furnitureModels: furniture.models,
    };

    stage = "keyboard-and-bounds";
    const yaw = async () => (await probe(page)).modelCamera.yaw;
    const zoom = async () => (await probe(page)).modelCamera.zoomFactor;
    near(await yaw(), modelCamera.yaw, "initial yaw");
    await tab(plan, "3D view").focus();
    await page.keyboard.press("ArrowRight");
    await settle(page);
    near(await yaw(), modelCamera.yaw, "arrows outside the scene");
    await scene(page).focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
    near(await yaw(), modelCamera.maxYaw, "max yaw");
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowLeft");
    near(await yaw(), modelCamera.minYaw, "min yaw");
    const box = await scene(page).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, 2000);
    await expect.poll(zoom).toBe(modelCamera.maxZoom);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -2000);
    await expect.poll(zoom).toBe(modelCamera.minZoom);
    await page.mouse.wheel(0, 300);
    await expect.poll(zoom).toBeGreaterThan(modelCamera.minZoom);
    await scene(page).focus();
    await page.keyboard.press("Escape");
    await ready(page);
    near(await yaw(), modelCamera.yaw, "overview yaw");
    near(await zoom(), modelCamera.minZoom, "overview zoom");
    for (const width of [1024, 1280, 1440]) {
      await resize(page, width);
      await ready(page);
      await cornersInside(page);
      await noOverflow(page);
    }
    checks.keyboardAndBounds = {
      arrowsOutsideSceneIgnored: true,
      yawDegrees: [-5, 75],
      zoom: [modelCamera.minZoom, modelCamera.maxZoom],
      escapeResetsYawAndZoom: true,
      floorInsideCanvasAt: [1024, 1280, 1440],
    };

    stage = "selection";
    const kitchen = tab(plan, "Select Kitchen on plan");
    await kitchen.click();
    await ready(page);
    await expect(kitchen).toHaveAttribute("aria-selected", "true");
    assert.equal((await probe(page)).selection, floor.rooms[1]);
    await expect(page.getByText("Room not linked")).not.toHaveCount(0);
    await scene(page).focus();
    await page.keyboard.press("ArrowRight");
    await page.mouse.wheel(0, 100);
    await expect.poll(zoom).toBeGreaterThan(modelCamera.minZoom);
    await ready(page);
    const before = (await probe(page)).modelCamera;
    await resize(page, 1280);
    await ready(page);
    const after = await probe(page);
    near(after.modelCamera.yaw, before.yaw, "yaw across resize");
    near(after.modelCamera.zoomFactor, before.zoomFactor, "zoom across resize");
    assert.equal(after.selection, floor.rooms[1], "selection across resize");
    await resize(page, 1440);
    await ready(page);
    await scene(page).focus();
    await page.keyboard.press("Escape");
    await ready(page);
    assert.equal((await probe(page)).selection, null);
    await expect(kitchen).toHaveAttribute("aria-selected", "false");
    // An empty-canvas tap resets an already deselected, rotated camera.
    await scene(page).focus();
    await page.keyboard.press("ArrowRight");
    await scene(page)
      .locator("canvas")
      .click({ position: { x: 24, y: 24 } });
    await ready(page);
    near(await yaw(), modelCamera.yaw, "empty tap yaw");
    checks.selection = {
      unlinkedRoomSelected: true,
      resizeKeepsYawZoomAndRoom: true,
      escapeClearsSelection: true,
      emptyTapResetsOverview: true,
    };

    stage = "reduced-motion";
    const living = tab(plan, "Select Living room on plan");
    assert(
      await animationDuring(page, () => living.click()),
      "Control: a room transition must animate without reduced motion",
    );
    await ready(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert(
      !(await animationDuring(page, () => kitchen.click())),
      "Reduced motion must apply the pose directly",
    );
    await ready(page);
    assert.equal((await probe(page)).selection, floor.rooms[1]);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await scene(page).focus();
    await page.keyboard.press("Escape");
    await ready(page);
    checks.reducedMotion = { controlAnimated: true, reducedImmediate: true };
    await page.screenshot({ path: join(output, "home-3d-1440.png") });

    stage = "marker-detail";
    const home = page.url();
    const panel = page.getByTestId("detail-panel");
    const details = page.getByText("Observation details", { exact: true });
    // Positions are re-read each time: the panel resizes Home's canvas.
    const openLamp = async () => {
      await expect
        .poll(async () => {
          const before = (await probe(page)).size;
          await settle(page);
          const after = (await probe(page)).size;
          return before.width === after.width && before.height === after.height;
        })
        .toBe(true);
      await ready(page);
      const lamp = (await assertFixtureScene(page, floor)).markers.find(
        (marker) => marker.key === fixtureMarkers[0],
      );
      const canvas = await scene(page).locator("canvas").boundingBox();
      await page.mouse.click(canvas.x + lamp.x, canvas.y + lamp.y);
      await expect(details).toBeVisible();
      assert.notEqual(page.url(), home, "Marker must open its detail URL");
    };
    // Wide desktop: the detail opens beside Home and the same scene stays.
    const kept = await counters(page);
    for (const close of ["Escape", "Close details"]) {
      await openLamp();
      await expect(panel).toBeVisible();
      await ready(page);
      if (close === "Escape") {
        await expect(panel.getByTestId("detail-title")).toBeFocused();
        await page.keyboard.press("Escape");
      } else
        await panel.getByRole("button", { name: close, exact: true }).click();
      await expect(panel).toBeHidden();
      assert.equal(page.url(), home, "Closing returns to Home");
      await expect(page.locator("#home-list-title")).toBeFocused();
      await ready(page);
      assert.equal(
        (await counters(page)).created,
        kept.created,
        "The panel must keep Home's renderer",
      );
    }
    // Narrow desktop: a full route releases Home's renderer.
    await resize(page, 1024);
    await ready(page);
    await openLamp();
    await expect(panel).toBeHidden();
    await noScene(page);
    await page.goBack();
    await resize(page, 1440);
    await ready(page);
    await assertFixtureScene(page, floor);
    checks.markerToDetail = {
      panelAt1440KeepsScene: true,
      closedByEscapeAndButton: true,
      routeAt1024ReleasesRenderer: true,
    };

    stage = "inactive-route";
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("link", { name: "Floor plan", exact: true }).click();
    await expect(
      page.getByText("Sample floor plan", { exact: true }),
    ).toBeVisible();
    await expect(tab(page, "3D view")).toHaveAttribute("aria-selected", "true");
    await ready(page);
    await assertFixtureScene(page, floor);
    await nav.getByRole("link", { name: "Overview", exact: true }).click();
    await ready(page);
    assertSingleRenderer(await counters(page));
    checks.inactiveRoute = { houseDefault3d: true, singleRenderer: true };

    stage = "out-of-viewport";
    // A short window lets the scene leave the viewport whatever the length of
    // Home's device grid; in a tall one the last card can share the screen
    // with the bottom edge of the scene, which then rightly keeps drawing.
    const shortWindow = 640;
    await resize(page, 1440, shortWindow);
    const vent = page.getByRole("button", {
      name: "Open device: Office booster vent",
      exact: true,
    });
    await vent.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page
          .locator("[data-s01-scene]")
          .evaluateAll((nodes) =>
            nodes.every((node) => node.sceneProbe?.visible === false),
          ),
      )
      .toBe(true);
    const parked = await counters(page);
    // A resize would draw a visible scene; out of view it must not.
    await resize(page, 1280, shortWindow);
    await page.waitForTimeout(1200);
    const suspended = await counters(page);
    assert.equal(suspended.frames, parked.frames, "Frames while out of view");
    assert.equal(suspended.live, 1, "Scroll keeps the renderer allocated");
    await resize(page, 1440);
    await tab(plan, "3D view").scrollIntoViewIfNeeded();
    await ready(page);
    await expect
      .poll(async () => (await counters(page)).frames)
      .toBeGreaterThan(suspended.frames);
    checks.outOfViewport = { framesSuspended: true, rendererRetained: true };

    stage = "injected-visibility";
    await hideDocument(page, true);
    await expect.poll(async () => (await counters(page)).live).toBe(0);
    const hidden = await counters(page);
    await page.waitForTimeout(1200);
    assert.deepEqual(await counters(page), hidden, "Hidden document is idle");
    await hideDocument(page, false);
    await ready(page);
    checks.injectedVisibility = {
      source:
        "injected document.hidden + visibilitychange; real listener, not a hidden tab",
      rendererReleased: true,
      recreated: true,
    };

    stage = "explicit-choice";
    await tab(plan, "2D plan").click();
    await noScene(page);
    await resize(page, 1023);
    await expandCompactPlan(page);
    await expect(tab(plan, "2D plan")).toHaveAttribute("aria-selected", "true");
    await resize(page, 1440);
    await expect(tab(plan, "2D plan")).toHaveAttribute("aria-selected", "true");
    await noScene(page);
    await resize(page, 430, 932);
    await expandCompactPlan(page);
    await tab(plan, "3D view").click();
    await ready(page);
    await expect(scene(page)).toHaveAttribute("data-camera-mode", "orbit");
    await resize(page, 1440);
    await ready(page);
    await expect(scene(page)).toHaveAttribute("data-camera-mode", "model");
    checks.explicitChoice = { kept2d: true, compact3dOrbit: true };

    stage = "compact-widths";
    // The explicit 3D choice above must survive the return to phone widths.
    const compact = [];
    for (const [width, height] of [
      [430, 932],
      [320, 700],
    ]) {
      await resize(page, width, height);
      await expandCompactPlan(page);
      await expect(tab(plan, "3D view")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await ready(page);
      await expect(scene(page)).toHaveAttribute("data-camera-mode", "orbit");
      await assertFixtureScene(page, floor);
      await cornersInside(page);
      await labelsLegible(page);
      await noOverflow(page);
      const { size, labels } = await probe(page);
      compact.push({
        width,
        canvas: [Math.round(size.width), Math.round(size.height)],
        labelsDrawn: labels.filter((label) => label.visible).length,
      });
    }
    assertSingleRenderer(await counters(page));
    checks.compactWidths = {
      orbitKept: true,
      floorInsideCanvas: true,
      labelsInsideAndApart: true,
      noOverflow: true,
      widths: compact,
    };

    stage = "floor-switch";
    assert(floors.length >= 2, "The sample must have two floors");
    const switches = [];
    for (const [width, height, mode] of [
      [430, 932, "orbit"],
      [1440, 1000, "model"],
    ]) {
      await resize(page, width, height);
      if (width < 1024) await expandCompactPlan(page);
      await ready(page);
      await expect(scene(page)).toHaveAttribute("data-camera-mode", mode);
      await tab(plan, "Select Kitchen on plan").click();
      await ready(page);
      assert.equal((await probe(page)).selection, floor.rooms[1]);
      const before = await counters(page);
      await tab(plan, "Floor 2").click();
      await expect(tab(plan, "Floor 2")).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await ready(page);
      await expect
        .poll(async () => (await probe(page)).rooms.map((room) => room.id))
        .toEqual(floors[1].rooms);
      const upper = await probe(page);
      assert.equal(upper.selection, null, "A floor change clears selection");
      assert.equal(upper.markers.length, 0, "Floor 2 has no fixture marker");
      await expect(roomTabs(plan)).toHaveCount(floors[1].rooms.length);
      await cornersInside(page);
      await noOverflow(page);
      await tab(plan, "Floor 1").click();
      await ready(page);
      await expect
        .poll(async () => (await probe(page)).rooms.map((room) => room.id))
        .toEqual(floor.rooms);
      await assertFixtureScene(page, floor);
      assert.equal((await probe(page)).selection, null);
      await expect(roomTabs(plan)).toHaveCount(floor.rooms.length);
      await cornersInside(page);
      await labelsLegible(page);
      const after = await counters(page);
      assertSingleRenderer(after);
      switches.push({
        width,
        mode,
        renderersCreated: after.created - before.created,
      });
    }
    checks.floorSwitch = {
      roomsMatch2dTabs: true,
      selectionCleared: true,
      markersFollowFloor: true,
      floorInsideCanvas: true,
      singleRenderer: true,
      switches,
    };

    stage = "context-loss";
    provoked.add("context-loss");
    await scene(page).evaluate((node) =>
      node
        .querySelector("canvas")
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
    await expect(
      page.getByText("3D view unavailable", { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await counters(page)).live).toBe(0);
    const failed = await counters(page);
    await tab(plan, "Floor 2").click();
    await tab(plan, "2D plan").click();
    await tab(plan, "3D view").click();
    await resize(page, 1280);
    await nav.getByRole("link", { name: "Connection", exact: true }).click();
    await page.goBack();
    await expect(
      page.getByText("3D view unavailable", { exact: true }),
    ).toBeVisible();
    assert.equal((await counters(page)).created, failed.created);
    await expect(tab(plan, "Floor 2")).toHaveAttribute("aria-selected", "true");
    await page
      .getByRole("button", { name: "Retry 3D view", exact: true })
      .click();
    await ready(page);
    provoked.delete("context-loss");
    assert((await counters(page)).created > failed.created);
    checks.contextLoss = {
      realWebglLoseContext: true,
      survivesFloorViewWidthAndRoute: true,
      explicitRetryOnly: true,
    };
    const final = await counters(page);
    assertSingleRenderer(final);
    checks.renderers = final;
  } catch (error) {
    await failureEvidence();
    throw error;
  } finally {
    await context.close();
  }

  stage = "webgl-absent";
  const denied = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  try {
    await observe(denied, new Set());
    await denied.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return String(type).startsWith("webgl")
          ? null
          : get.call(this, type, ...args);
      };
    });
    page = await denied.newPage();
    await page.goto(server.origin, { waitUntil: "networkidle" });
    await demo(page);
    const plan = page.getByTestId("home-plan-overview");
    const unavailable = page.getByText("3D view unavailable", { exact: true });
    await expect(unavailable).toBeVisible();
    await expect(
      page.getByText(/does not provide WebGL\. The 2D plan/),
    ).toBeVisible();
    await expect(tab(plan, "Select Kitchen on plan")).toBeVisible();
    await tab(plan, "Select Kitchen on plan").click();
    await expect(tab(plan, "Select Kitchen on plan")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page
      .getByRole("button", { name: "Retry 3D view", exact: true })
      .click();
    await expect(unavailable).toBeVisible();
    await noOverflow(page);
    await plan.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(output, "fallback-1440.png") });
    await page.getByRole("button", { name: "Show all rooms" }).click();
    for (const on of [true, false]) {
      await page
        .getByRole("button", {
          name: `Turn Living room lamp ${on ? "on" : "off"}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("button", {
          name: `Turn Living room lamp ${on ? "off" : "on"}`,
          exact: true,
        }),
      ).toBeEnabled();
      await page
        .getByRole("button", {
          name: "Dismiss result for Living room lamp",
          exact: true,
        })
        .click();
    }
    const none = await counters(page);
    assert.equal(none.created, 0, "No renderer without WebGL");
    report.checks.webglAbsent = {
      durableFallback: true,
      retryFailsClosed: true,
      roomSelection: true,
      simulatedOnOff: true,
      renderersCreated: 0,
    };
  } catch (error) {
    await failureEvidence();
    throw error;
  } finally {
    await denied.close();
  }
}

/**
 * C3: a furniture GLB whose transport never finishes. The held asset must stay
 * a visible fallback, a floor change or scene teardown while it loads must not
 * receive a late result, and once the wait is bounded a later scene build may
 * request it again. Waiting alone must not trigger a second request.
 */
async function stalledAsset() {
  stage = "stalled-asset";
  const { context, floor } = await fixtureContext({
    viewport: { width: 1440, height: 1000 },
  });
  try {
    // Held from here on: the setup pages above loaded every asset normally.
    const held = await holdAsset(context, "**/loungeSofa*.glb");
    await page.reload({ waitUntil: "domcontentloaded" });
    await demo(page);
    const plan = page.getByTestId("home-plan-overview");
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const oneHeld = async () => {
      await expect
        .poll(async () => (await probe(page)).furniture.models)
        .toBeGreaterThan(0);
      await expect
        .poll(async () => (await probe(page)).furniture.fallbacks)
        .toBe(1);
    };
    await ready(page);
    await assertFixtureScene(page, floor);
    await oneHeld();
    const { models } = (await probe(page)).furniture;

    // Floor change and teardown while the asset is in flight, then a late success.
    const lateStart = held.requests;
    await tab(plan, "Floor 2").click();
    await ready(page);
    await nav.getByRole("link", { name: "Connection", exact: true }).click();
    await noScene(page);
    assert.equal(await held.release(), 1, "One held sofa request");
    await page.goBack();
    await ready(page);
    await expect(tab(plan, "Floor 2")).toHaveAttribute("aria-selected", "true");
    await settle(page);
    assert.deepEqual(
      (await probe(page)).furniture,
      { models: 0, fallbacks: 0 },
      "A late asset never lands on another floor",
    );
    await tab(plan, "Floor 1").click();
    await ready(page);
    await expect
      .poll(async () => (await probe(page)).furniture)
      .toEqual({ models: models + 1, fallbacks: 0 });
    assert.equal(held.requests - lateStart, 0, "The late result was reused");
    assertSingleRenderer(await counters(page));

    // A transport that never finishes: fresh page, so nothing is cached.
    held.hold = true;
    const before = held.requests;
    await page.reload({ waitUntil: "domcontentloaded" });
    await demo(page);
    await ready(page);
    await oneHeld();
    await nav.getByRole("link", { name: "Connection", exact: true }).click();
    await noScene(page);
    await page.goBack();
    await ready(page);
    await oneHeld();
    // Waiting past the app's bound must not, by itself, ask again.
    await page.waitForTimeout(assetBoundMs + 2_000);
    assert.equal(held.requests - before, 1, "No automatic retry");
    assert.equal((await probe(page)).furniture.fallbacks, 1);
    held.hold = false;
    await tab(plan, "Floor 2").click();
    await ready(page);
    await tab(plan, "Floor 1").click();
    await ready(page);
    await expect
      .poll(async () => (await probe(page)).furniture, {
        message: "A later scene build must load the asset that timed out",
      })
      .toEqual({ models: models + 1, fallbacks: 0 });
    assert.equal(held.requests - before, 2, "Exactly one later attempt");
    await held.release();
    await settle(page);
    assert.deepEqual((await probe(page)).furniture, {
      models: models + 1,
      fallbacks: 0,
    });
    assertSingleRenderer(await counters(page));
    report.checks.stalledAsset = {
      heldAsset: "loungeSofa",
      lateSuccessAfterFloorChangeAndTeardown: "ignored, then reused",
      stalledFallbackVisible: true,
      noAutomaticRetry: true,
      laterAttemptLoads: true,
      waitedWithoutRetryMs: assetBoundMs + 2_000,
    };
  } catch (error) {
    await failureEvidence();
    throw error;
  } finally {
    await context.close();
  }
}

async function measure() {
  stage = "performance";
  const { context, floor } = await fixtureContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
  });
  const row = {
    scenario:
      "headed local Chrome, public sample, two fixture markers, fresh context, no services",
    viewportSource: "Playwright viewport 1440x1000, deviceScaleFactor 2",
  };
  report.performance = row;
  try {
    const plan = page.getByTestId("home-plan-overview");
    await ready(page);
    await assertFixtureScene(page, floor);
    row.markers = fixtureMarkers.length;
    row.gpu = await webglRenderer(page);
    await tab(plan, "2D plan").click();
    await noScene(page);
    row.opens = [];
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      await tab(plan, "3D view").click();
      await ready(page);
      row.opens.push({
        clickToReadyMs: Date.now() - started,
        rendererReadyMs: (await probe(page)).readyMs,
      });
      if (i < 2) {
        await tab(plan, "2D plan").click();
        await noScene(page);
      }
    }
    await assertFixtureScene(page, floor);
    const current = await probe(page);
    row.viewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    }));
    row.canvas = current.size;
    row.fps = [];
    for (let i = 0; i < 3; i++) {
      const box = await scene(page).boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      const initial = await counters(page);
      const started = Date.now();
      for (let step = 0; Date.now() - started < 10_000; step++) {
        await page.mouse.move(x + Math.sin(step * 0.06) * 20, y);
        await page.waitForTimeout(8);
      }
      await page.mouse.up();
      const elapsed = Date.now() - started;
      row.fps.push(
        Math.round(
          (((await counters(page)).frames - initial.frames) * 10000) / elapsed,
        ) / 10,
      );
    }
    row.medianFps = median(row.fps);
    await ready(page);
    await page.waitForTimeout(250);
    const idle = await counters(page);
    await page.waitForTimeout(2000);
    row.idleFrames = (await counters(page)).frames - idle.frames;
    await page.screenshot({ path: join(output, "performance-1440.png") });
    Object.assign(
      row,
      assessPerformance({
        gpu: row.gpu,
        opens: row.opens.map((open) => open.clickToReadyMs),
        fps: row.fps,
        idleFrames: row.idleFrames,
      }),
    );
  } catch (error) {
    await failureEvidence();
    throw error;
  } finally {
    await context.close();
  }

  stage = "browser-zoom";
  // Chrome's own default zoom, set in a disposable profile; never CSS zoom.
  const profile = await mkdtemp(join(temporary, "zoom-profile-"));
  await mkdir(join(profile, "Default"));
  await writeFile(
    join(profile, "Default/Preferences"),
    JSON.stringify({
      partition: { default_zoom_level: { x: Math.log(2) / Math.log(1.2) } },
    }),
  );
  const zoomed = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: false,
    viewport: null,
    args: ["--window-size=1440,1000"],
    serviceWorkers: "block",
    ...ownSignals,
  });
  persistent.push(zoomed);
  try {
    await observe(zoomed, new Set());
    page = await zoomed.newPage();
    await page.goto(server.origin, { waitUntil: "networkidle" });
    const viewport = await page.evaluate(() => ({
      innerWidth,
      outerWidth,
      dpr: devicePixelRatio,
      cssZoom: getComputedStyle(document.documentElement).zoom,
    }));
    assert(
      Math.abs(viewport.innerWidth * 2 - viewport.outerWidth) <= 2,
      "Chrome zoom must halve the CSS viewport",
    );
    await demo(page);
    const plan = page.getByTestId("home-plan-overview");
    await expandCompactPlan(page);
    await tab(plan, "3D view").click();
    await ready(page);
    await expect(scene(page)).toHaveAttribute("data-camera-mode", "orbit");
    await noOverflow(page);
    await scene(page).scrollIntoViewIfNeeded();
    // Playwright's page capture clips a zoomed window to a quarter; CDP
    // captures the surface actually shown.
    const cdp = await zoomed.newCDPSession(page);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
    });
    await writeFile(join(output, "zoom200.png"), Buffer.from(data, "base64"));
    report.zoom200 = { ...viewport, compactOrbit: true, noOverflow: true };
  } catch (error) {
    await failureEvidence();
    throw error;
  } finally {
    await zoomed.close();
    persistent.splice(persistent.indexOf(zoomed), 1);
  }
  assert(row.accepted, `Performance budget failed: ${row.failures.join(", ")}`);
}

try {
  await mkdir(output, { recursive: true });
  for (const file of spatialArtifacts)
    await unlink(join(output, file)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  temporary = await mkdtemp(join(tmpdir(), "maurice-spatial-ui-"));
  const workspace = join(temporary, "project");
  const cache = join(temporary, "cache");
  await mkdir(cache);
  await copyPublicSource(root, workspace);
  const env = publicEnvironment(process.env, cache);
  const build = { cwd: workspace, env, signal: controller.signal };
  console.log("Spatial UI: install isolated lockfile and R01 patch");
  stage = "install";
  await run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], build);
  report.plan = await assertPublicPlan(workspace);
  console.log("Spatial UI: export sample with isolated transform cache");
  stage = "export";
  await run(
    "npx",
    [
      "--no-install",
      "expo",
      "export",
      "--platform",
      "web",
      "--source-maps",
      "--output-dir",
      "build-web",
    ],
    build,
  );
  await assertPublicPlan(workspace);
  await run(
    "npm",
    ["run", "check:runtime-dependencies", "--", "build-web", "web"],
    build,
  );
  publicVerified = true;
  server = await previewServer(join(workspace, "build-web"));
  stage = "browser";
  browser = await chromium.launch(
    options.headed
      ? { channel: "chrome", headless: false, ...ownSignals }
      : {
          headless: true,
          args: ["--enable-unsafe-swiftshader"],
          ...ownSignals,
        },
  );
  report.browser = {
    version: browser.version(),
    channel: options.headed ? "chrome" : "playwright-chromium",
    headless: !options.headed,
  };
  console.log(`Spatial UI: functional checks (${report.mode})`);
  await functional();
  await stalledAsset();
  if (options.performance) {
    console.log("Spatial UI: GPU budget and browser zoom");
    await measure();
  }
  assert.equal(report.externalRequests, 0, "No external requests");
  assert.equal(
    report.console.unexpectedCount,
    0,
    "Unexpected page or console errors",
  );
  report.result = "passed";
} catch (error) {
  report.failedStage = stage;
  report.interrupted = controller.signal.aborted;
  report.failure = String(error.message)
    .replaceAll(root, "[source]")
    .replaceAll(temporary ?? "\0", "[temporary]")
    .replaceAll(homedir(), "[home]")
    .slice(0, 3000);
  await failureEvidence();
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  for (const context of persistent) await context.close().catch(() => {});
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  const after = await readOptional(originalPath);
  report.developerPlanUnchanged =
    original === null ? after === null : original.equals(after);
  try {
    report.revision = git(["rev-parse", "HEAD"]);
    const checkoutAfter = git(["status", "--porcelain"]);
    report.dirtySource = !!checkoutAfter;
    report.checkoutUnchanged = checkoutBefore === checkoutAfter;
  } catch {
    report.revision = "unrecorded";
  }
  if (!report.developerPlanUnchanged || report.checkoutUnchanged === false) {
    report.result = "failed";
    process.exitCode = 1;
  }
  report.artifacts = [];
  let bytes = 0;
  for (const file of spatialArtifacts.filter((name) => name !== "report.json"))
    try {
      const size = (await stat(join(output, file))).size;
      bytes += size;
      report.artifacts.push({ file, bytes: size });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  if (bytes > artifactBudgetBytes) {
    for (const { file } of report.artifacts) await unlink(join(output, file));
    report.artifacts = [];
    report.failure = "Spatial capture budget exceeded; captures removed";
    report.result = "failed";
    process.exitCode = 1;
  }
  report.serverAndBrowserClosed = true;
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
}
