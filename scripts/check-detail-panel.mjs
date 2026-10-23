// Detail workspace navigation proof (B02): URLs, Back/Forward, focus, Home and
// renderer instances on the public sample only. No HA, credentials or services.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import {
  assertPublicPlan,
  copyPublicSource,
  publicEnvironment,
  run,
} from "./lib/public-build.mjs";
import { previewServer } from "./lib/preview-server.mjs";

const root = process.cwd();
const output = join(root, "artifacts/detail-panel");
// Public sample captures only, allowlisted and size-bounded like the UI smoke.
const pictures = [430, 1024, 1280, 1440, "zoom200"].map(
  (name) => `panel-${name}.png`,
);
const controller = new AbortController();
let browser, server, temporary, workspace, env;
const fixtures = new Set();
let stage = "prepare";
const report = {
  schema: 1,
  publicSampleOnly: true,
  realHaRequired: false,
  physicalServiceCalls: 0,
  rows: [],
  pageErrors: [],
  externalRequests: 0,
  result: "failed",
};
const stop = () => {
  controller.abort();
  void browser?.close();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const deadline = setTimeout(stop, 20 * 60_000);
// Playwright would otherwise exit(130) on SIGINT before this runner's cleanup.
const ownSignals = {
  handleSIGINT: false,
  handleSIGTERM: false,
  handleSIGHUP: false,
};

async function open(
  width,
  { height = 932, scale = 1, sockets = [], using = browser } = {},
) {
  const context = await using.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === server.origin)
      return route.continue();
    report.externalRequests++;
    return route.abort();
  });
  // Only an explicitly started public fixture socket may connect.
  await context.routeWebSocket("**/*", (socket) => {
    if (sockets.includes(socket.url())) return socket.connectToServer();
    report.externalRequests++;
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on("pageerror", (error) => {
    if (report.pageErrors.length < 10)
      report.pageErrors.push(error.message.slice(0, 500));
  });
  return { context, page };
}
async function demo(page, path = "/") {
  await page.goto(server.origin + path, { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Explore demo home", exact: true })
    .click();
  await page
    .getByText("Maurice · demo home", { exact: true })
    .first()
    .waitFor();
}
// A's closed public HA fixture, launched exactly as browser-connection-check does.
async function startFixture() {
  const child = spawn(
    process.execPath,
    ["scripts/trial-ha-fixture.mjs", "0", "--power-proof"],
    { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  fixtures.add(child);
  const [bytes] = await once(child.stdout, "data", {
    signal: AbortSignal.timeout(15_000),
  });
  const { port, fixtureOnly } = JSON.parse(String(bytes));
  assert.equal(fixtureOnly, true);
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    socket: `ws://127.0.0.1:${port}/api/websocket`,
    serviceCalls: async () =>
      (await (await fetch(origin + "/_proof/status")).json()).counters
        .serviceCalls,
  };
}
async function stopFixtures() {
  for (const child of fixtures) {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
    fixtures.delete(child);
  }
}
async function connectFixture(page, fixture) {
  if (page.url() === "about:blank")
    await page.goto(server.origin + "/settings", { waitUntil: "networkidle" });
  else
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Connection", exact: true })
      .click();
  await page
    .getByLabel("Home Assistant URL", { exact: true })
    .fill(fixture.origin);
  await page
    .getByLabel("Access token", { exact: true })
    .fill("maurice-trial-proof");
  await page
    .getByRole("switch", { name: "Trust local HTTP network", exact: true })
    .check();
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page
    .getByText("Synced with HA", { exact: true })
    .filter({ visible: true })
    .waitFor();
}
async function noOverflow(page) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Page must fit the viewport",
  );
}
// Every observation waits for two frames so layout, focus and counters settle.
async function observe(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const visible = (id) =>
    page.getByTestId(id).filter({ visible: true }).count();
  return {
    path: await page.evaluate(() => location.pathname + location.search),
    homes: await page.getByTestId("home-overview").count(),
    markedHomes: await page
      .locator('[data-testid="home-overview"][data-runner-home]')
      .count(),
    visibleHomes: await visible("home-overview"),
    panel: await visible("detail-panel"),
    summary: await visible("device-summary"),
    reading: await visible("reading-detail"),
    focus: await page.evaluate(() => document.activeElement?.id || null),
    focusTestId: await page.evaluate(
      () => document.activeElement?.getAttribute("data-testid") ?? null,
    ),
    rail: await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'nav[aria-label="Main navigation"] [aria-current="page"]',
        ),
      ].map((link) => link.textContent.replace(/[^\x20-\x7e]/g, "").trim()),
    ),
    renderers: await page.evaluate(() =>
      JSON.parse(document.documentElement.dataset.mauriceRenderers ?? "null"),
    ),
  };
}
async function row(name, expected, check) {
  // After an interruption or the deadline, stop instead of failing each row.
  controller.signal.throwIfAborted();
  const entry = { name, expected, steps: [], pass: false };
  report.rows.push(entry);
  try {
    await check(async (step, page, assertion) => {
      const state = await observe(page);
      entry.steps.push({ step, ...state });
      assertion(state);
    });
    entry.pass = true;
  } catch (error) {
    entry.failure = String(error.message).split("\n")[0].slice(0, 300);
  }
}
const card = (page, name) =>
  page.getByRole("button", { name: `Open device: ${name}`, exact: true });
// A remounted Home renders a new overview node without this mark.
const markHome = (page) =>
  page.getByTestId("home-overview").evaluateAll((nodes) => {
    for (const node of nodes) node.dataset.runnerHome = "1";
  });
const lampPath = "/appliance/demo-plug?profile=demo";
const feederPath = "/appliance/demo-feeder?profile=demo";
const readingPath = "/device/demo-sensor.feeder_last?profile=demo";
const created = (state) => state.renderers?.created ?? 0;
const panelWidth = async (page) =>
  Math.round(
    (
      await page
        .getByTestId("detail-panel")
        .filter({ visible: true })
        .boundingBox()
    )?.width ?? 0,
  );
report.panelWidths = {};

try {
  await mkdir(output, { recursive: true });
  for (const file of pictures)
    await unlink(join(output, file)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  temporary = await mkdtemp(join(tmpdir(), "maurice-detail-panel-"));
  workspace = join(temporary, "project");
  const cache = join(temporary, "cache");
  await mkdir(cache);
  await copyPublicSource(root, workspace);
  env = publicEnvironment(process.env, cache);
  const options = { cwd: workspace, env, signal: controller.signal };
  stage = "install";
  await run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], options);
  report.plan = await assertPublicPlan(workspace);
  stage = "export";
  await run(
    "npx",
    ["--no-install", "expo", "export", "--platform", "web"],
    options,
  );
  await assertPublicPlan(workspace);
  server = await previewServer(join(workspace, "dist"));
  browser = await chromium.launch({ headless: true, ...ownSignals });
  report.chromium = browser.version();
  stage = "browser";

  await row(
    "Home → device → reading, then Back, Back, Forward",
    "Panel follows the URL; Home stays visible; one Home and no new renderer; focus returns to the card",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        const home = await observe(page);
        const origin = card(page, "Cat feeder");
        const originId = await origin.getAttribute("id");
        await origin.focus();
        await page.keyboard.press("Enter");
        await step("device", page, (s) => {
          assert.equal(s.path, feederPath);
          assert.equal(s.summary, 1);
          assert.equal(s.visibleHomes, 1);
          assert.equal(s.homes, 1);
          assert.equal(created(s), created(home));
        });
        await page
          .getByRole("button", { name: "Show all 7 readings", exact: true })
          .click();
        await page.getByRole("button", { name: /^Last distribution,/ }).click();
        await step("reading", page, (s) => {
          assert.equal(s.path, readingPath);
          assert.equal(s.reading, 1);
          assert.equal(s.visibleHomes, 1);
        });
        await page.goBack();
        await step("back to device", page, (s) => {
          assert.equal(s.path, feederPath);
          assert.equal(s.summary, 1);
        });
        await page.goBack();
        await step("back to list", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.panel, 0);
          assert.equal(s.homes, 1);
          assert.equal(s.focus, originId);
          assert.equal(created(s), created(home));
        });
        await page.goForward();
        await step("forward to device", page, (s) => {
          assert.equal(s.path, feederPath);
          assert.equal(s.summary, 1);
          assert.equal(s.homes, 1);
          assert.equal(created(s), created(home));
        });
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Device A → device B from Home",
    "Push: B is a new entry; Back returns to A, then to the list",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        await card(page, "Living room lamp").click();
        await step("A", page, (s) => assert.equal(s.path, lampPath));
        await card(page, "Cat feeder").click();
        await step("B", page, (s) => {
          assert.equal(s.path, feederPath);
          assert.equal(s.summary, 1);
          assert.equal(s.homes, 1);
        });
        await page.goBack();
        await step("Back to A", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.summary, 1);
        });
        await page.goBack();
        await step("Back to list", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.panel, 0);
        });
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Close after internal navigation",
    "Closes to the list in one action, inside the app, focus on the origin card",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        const home = await observe(page);
        const origin = card(page, "Cat feeder");
        const originId = await origin.getAttribute("id");
        await origin.focus();
        await page.keyboard.press("Enter");
        await page
          .getByRole("button", { name: "Show all 7 readings", exact: true })
          .click();
        await page.getByRole("button", { name: /^Last distribution,/ }).click();
        await step("reading", page, (s) => assert.equal(s.path, readingPath));
        await page
          .getByRole("button", { name: "Close details", exact: true })
          .click();
        await step("closed", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.panel, 0);
          assert.equal(s.focus, originId);
          assert.equal(created(s), created(home));
        });
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Direct link in a new tab, then close",
    "Unavailable until the named home connects; closing stays in the app on the list",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await page.goto(server.origin + lampPath, { waitUntil: "networkidle" });
        await step("before connection", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.summary, 0);
          assert.equal(s.visibleHomes, 1);
        });
        await page
          .getByRole("button", { name: "Explore demo home", exact: true })
          .click();
        await page.getByTestId("device-summary").waitFor();
        await step("after connection", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.summary, 1);
        });
        await page
          .getByRole("button", { name: "Close details", exact: true })
          .click();
        await step("closed", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.panel, 0);
          assert.equal(s.visibleHomes, 1);
        });
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Reload without a session",
    "Connection state first; the same target returns only once its home connects",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        await card(page, "Living room lamp").click();
        await page.reload({ waitUntil: "networkidle" });
        await step("reloaded", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.summary, 0);
        });
        await page
          .getByRole("button", { name: "Explore demo home", exact: true })
          .click();
        await page.getByTestId("device-summary").waitFor();
        await step("reconnected", page, (s) => assert.equal(s.summary, 1));
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Resize 1440 → 430 → 1010 → 1024 → 1440 with a detail open",
    "Same URL, session and Home; a panel only in the desktop layout; Home's renderer released while the detail covers it",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        await markHome(page);
        await card(page, "Living room lamp").click();
        await step("1440", page, (s) => assert.equal(s.panel, 1));
        const start = await observe(page);
        for (const width of [430, 1010, 1024, 1440]) {
          await page.setViewportSize({ width, height: 932 });
          await step(String(width), page, (s) => {
            assert.equal(s.path, lampPath);
            assert.equal(s.summary, 1);
            assert.equal(s.panel, width === 1440 ? 1 : 0);
            assert.equal(s.visibleHomes, width === 1440 ? 1 : 0);
            assert.equal(s.homes, 1);
            assert.equal(s.markedHomes, 1, "Resizing must keep Home");
            assert.equal(s.renderers.live, width === 1440 ? 1 : 0);
            // A covered Home never draws, not even for one stale layout.
            if (width !== 1440) assert.equal(created(s), created(start));
            assert(s.renderers.peakLive <= 1);
          });
        }
        assert.equal(
          await page
            .getByRole("button", { name: "Explore demo home", exact: true })
            .count(),
          0,
          "Resizing must not lose the session",
        );
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Resize across the panel and desktop thresholds with Home shown",
    "One Home throughout; no new renderer while the desktop layout stays; no panel without a detail",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        await markHome(page);
        const start = await observe(page);
        // Compact Home defaults to 2D, so only the desktop widths keep the scene.
        const desktop = [1223, 1100, 1024];
        for (const width of [...desktop, 1023, 1010, 430, 1440]) {
          await page.setViewportSize({ width, height: 932 });
          await step(String(width), page, (s) => {
            assert.equal(s.path, "/");
            assert.equal(s.panel, 0);
            assert.equal(s.visibleHomes, 1);
            assert.equal(s.markedHomes, 1, "Resizing must keep Home");
            if (desktop.includes(width))
              assert.equal(created(s), created(start));
            assert(s.renderers.peakLive <= 1);
          });
        }
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Room filter changed while a detail is open",
    "Filter applies to Home only; the detail target is unchanged; closing keeps the filter",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        await card(page, "Living room lamp").click();
        const kitchen = page.getByRole("tab", { name: "Kitchen", exact: true });
        await kitchen.click();
        await step("filtered", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.summary, 1);
        });
        assert.equal(await kitchen.getAttribute("aria-selected"), "true");
        await page
          .getByRole("button", { name: "Close details", exact: true })
          .click();
        await step("closed", page, (s) => assert.equal(s.path, "/"));
        assert.equal(await kitchen.getAttribute("aria-selected"), "true");
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Compact 430 px route presentation",
    "Detail replaces Home as before; Back returns to Home; no panel",
    async (step) => {
      const { context, page } = await open(430);
      try {
        await demo(page);
        await card(page, "Living room lamp").click();
        await step("detail", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.panel, 0);
          assert.equal(s.visibleHomes, 0);
          assert.equal(s.summary, 1);
        });
        await page.goBack();
        await step("back", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.visibleHomes, 1);
        });
      } finally {
        await context.close();
      }
    },
  );
  for (const [width, expected] of [
    [1280, 360],
    [1440, 389],
    [1920, 440],
  ])
    await row(
      `Panel chrome, focus and keyboard at ${width} px`,
      `Measured ${expected} px panel; title focused on each detail; one step back; Escape closes to the card; Tab is not trapped; Overview stays current`,
      async (step) => {
        const { context, page } = await open(width);
        try {
          await demo(page);
          const origin = card(page, "Cat feeder");
          const originId = await origin.getAttribute("id");
          await origin.focus();
          await page.keyboard.press("Enter");
          await page.getByTestId("detail-panel").waitFor();
          report.panelWidths[width] = await panelWidth(page);
          await step("device", page, (s) => {
            assert.equal(report.panelWidths[width], expected);
            assert.equal(s.focusTestId, "detail-title");
            assert.deepEqual(s.rail, ["Overview"]);
          });
          assert.equal(
            await page
              .getByTestId("detail-panel")
              .getByRole("link", { name: /back/i })
              .count(),
            0,
            "The Stack header must not duplicate the panel chrome",
          );
          await page
            .getByRole("button", { name: "Show all 7 readings", exact: true })
            .click();
          await page
            .getByRole("button", { name: /^Last distribution,/ })
            .click();
          await step("reading", page, (s) => {
            assert.equal(s.path, readingPath);
            assert.equal(s.focusTestId, "detail-title");
          });
          await page
            .getByRole("button", {
              name: "Back to previous detail",
              exact: true,
            })
            .click();
          await step("back inside the panel", page, (s) => {
            assert.equal(s.path, feederPath);
            assert.equal(s.focusTestId, "detail-title");
          });
          const places = new Set();
          for (let i = 0; i < 40; i++) {
            await page.keyboard.press("Tab");
            places.add(
              await page.evaluate(
                () =>
                  !!document.activeElement?.closest(
                    '[data-testid="detail-panel"]',
                  ),
              ),
            );
          }
          assert.deepEqual(
            [...places].sort(),
            [false, true],
            "Tab must leave the panel",
          );
          assert.equal(await page.locator('[aria-modal="true"]').count(), 0);
          await page
            .getByTestId("detail-panel")
            .getByRole("button")
            .first()
            .focus();
          await page.keyboard.press("Escape");
          await step("Escape", page, (s) => {
            assert.equal(s.path, "/");
            assert.equal(s.panel, 0);
            assert.equal(s.focus, originId);
            assert.deepEqual(s.rail, ["Overview"]);
          });
        } finally {
          await context.close();
        }
      },
    );
  await row(
    "Escape while the house model is focused",
    "The camera owns Escape; the detail stays open",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        await card(page, "Living room lamp").click();
        // Let the panel's own title focus land before moving to the model.
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute("data-testid") ===
            "detail-title",
        );
        const scene = page.locator('[data-s01-scene][tabindex="0"]').first();
        await scene.focus();
        assert(
          await scene.evaluate((node) => node === document.activeElement),
          "The house model must hold focus",
        );
        await page.keyboard.press("Escape");
        await step("after Escape", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.panel, 1);
        });
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "Escape with a pending power permission (public HA fixture)",
    "First Escape cancels the confirmation and keeps the detail; the second closes it; no service is sent",
    async (step) => {
      const fixture = await startFixture();
      const { context, page } = await open(1440, {
        height: 1000,
        sockets: [fixture.socket],
      });
      try {
        await connectFixture(page, fixture);
        await card(page, "Trial plug").click();
        const panel = page.getByTestId("detail-panel");
        await panel
          .getByRole("button", { name: "Allow power control", exact: true })
          .click();
        await panel
          .getByRole("button", { name: "Cancel permission", exact: true })
          .waitFor();
        const detailPath = await page.evaluate(
          () => location.pathname + location.search,
        );
        await page.keyboard.press("Escape");
        await step("first Escape", page, (s) => {
          assert.equal(s.path, detailPath);
          assert.equal(s.panel, 1);
        });
        assert.equal(
          await panel
            .getByRole("button", { name: "Cancel permission", exact: true })
            .count(),
          0,
          "Escape must cancel the pending permission first",
        );
        await page.keyboard.press("Escape");
        await step("second Escape", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.panel, 0);
        });
        report.fixtureServiceCalls = await fixture.serviceCalls();
        assert.equal(report.fixtureServiceCalls, 0, "No service may be sent");
      } finally {
        await context.close();
        await stopFixtures();
      }
    },
  );
  report.recette = {};
  for (const width of [430, 1024, 1280, 1440])
    await row(
      `Recette at ${width} px with the mouse`,
      width >= 1280
        ? "Panel beside Home, no overflow, 48 px power targets inside the panel"
        : "Route presentation, no overflow, 48 px power targets",
      async (step) => {
        const { context, page } = await open(width);
        try {
          await demo(page);
          await card(page, "Living room lamp").click();
          await page.getByTestId("device-summary").waitFor();
          await step("lamp", page, (s) => {
            assert.equal(s.path, lampPath);
            assert.equal(s.panel, width >= 1280 ? 1 : 0);
            assert.equal(s.visibleHomes, width >= 1280 ? 1 : 0);
            assert.equal(s.summary, 1);
          });
          await noOverflow(page);
          for (const name of [
            "Turn Living room lamp on",
            "Turn Living room lamp off",
          ]) {
            const target = page
              .getByTestId("device-summary")
              .getByRole("button", { name, exact: true });
            await target.scrollIntoViewIfNeeded();
            const box = await target.boundingBox();
            assert(
              box.width >= 48 &&
                box.height >= 48 &&
                box.x >= 0 &&
                box.x + box.width <= width + 1,
              `${name} must fit and be at least 48 px`,
            );
          }
          report.recette[width] = {
            presentation: width >= 1280 ? "panel" : "route",
            panelWidth: width >= 1280 ? await panelWidth(page) : null,
          };
          await page.screenshot({ path: join(output, `panel-${width}.png`) });
        } finally {
          await context.close();
        }
      },
    );
  await row(
    "200 % zoom, emulated as a 720 px viewport at device scale 2",
    "The 1440 px window at 200 % uses route presentation without overflow",
    async (step) => {
      const { context, page } = await open(720, { height: 466, scale: 2 });
      try {
        await demo(page);
        await card(page, "Living room lamp").click();
        await page.getByTestId("device-summary").waitFor();
        await step("lamp", page, (s) => {
          assert.equal(s.path, lampPath);
          assert.equal(s.panel, 0);
          assert.equal(s.summary, 1);
        });
        await noOverflow(page);
        await page.screenshot({ path: join(output, "panel-zoom200.png") });
        await page.goBack();
        await step("Back", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.visibleHomes, 1);
        });
      } finally {
        await context.close();
      }
    },
  );
  await row(
    "WebGL unavailable",
    "The durable 2D fallback stays through opening and closing the panel; no renderer",
    async (step) => {
      const noWebGl = await chromium.launch({
        headless: true,
        args: ["--disable-webgl", "--disable-3d-apis"],
        ...ownSignals,
      });
      try {
        const { page } = await open(1440, { using: noWebGl });
        await demo(page);
        const fallback = page
          .getByText("3D view unavailable", { exact: true })
          .filter({ visible: true });
        await fallback.waitFor({ timeout: 15_000 });
        await card(page, "Living room lamp").click();
        await step("panel open", page, (s) => {
          assert.equal(s.panel, 1);
          assert.equal(s.renderers?.live ?? 0, 0);
        });
        assert.equal(await fallback.count(), 1);
        await page.keyboard.press("Escape");
        await step("closed", page, (s) => {
          assert.equal(s.path, "/");
          assert.equal(s.renderers?.live ?? 0, 0);
        });
        assert.equal(await fallback.count(), 1);
      } finally {
        await noWebGl.close();
      }
    },
  );
  await row(
    "Reload, then reconnect the same fixture home",
    "Not connected after reload; after reconnecting, Back returns to the same target, shown again; no service",
    async (step) => {
      const fixture = await startFixture();
      const { context, page } = await open(1440, { sockets: [fixture.socket] });
      try {
        await connectFixture(page, fixture);
        await card(page, "Trial plug").click();
        await page.getByTestId("device-summary").waitFor();
        const detailPath = await page.evaluate(
          () => location.pathname + location.search,
        );
        await page.reload({ waitUntil: "networkidle" });
        await step("reloaded", page, (s) => {
          assert.equal(s.path, detailPath);
          assert.equal(s.panel, 1);
          assert.equal(s.summary, 0);
        });
        assert.equal(
          await page
            .getByTestId("detail-panel")
            .getByText("Not connected", { exact: true })
            .count(),
          1,
        );
        await connectFixture(page, fixture);
        await page.goBack();
        await page.getByTestId("device-summary").waitFor();
        await step("reconnected, Back", page, (s) => {
          assert.equal(s.path, detailPath);
          assert.equal(s.summary, 1);
        });
        assert.equal(await fixture.serviceCalls(), 0);
      } finally {
        await context.close();
        await stopFixtures();
      }
    },
  );
  await row(
    "Two homes with identical entity IDs",
    "A detail of home A never shows or operates home B's identical device",
    async (step) => {
      const homeA = await startFixture();
      const homeB = await startFixture();
      const { context, page } = await open(1440, {
        sockets: [homeA.socket, homeB.socket],
      });
      try {
        await connectFixture(page, homeA);
        await card(page, "Trial plug").click();
        await page.getByTestId("device-summary").waitFor();
        const detailA = await page.evaluate(
          () => location.pathname + location.search,
        );
        await connectFixture(page, homeB);
        // Settings replaces itself with "/": record the instances it leaves.
        await step("home B", page, (s) => assert.equal(s.path, "/"));
        await page.goBack();
        await step("home A's detail while B is connected", page, (s) => {
          assert.equal(s.path, detailA);
          assert.equal(s.panel, 1);
          assert.equal(s.summary, 0);
        });
        const panel = page.getByTestId("detail-panel");
        assert.equal(
          await panel.getByText("Device unavailable", { exact: true }).count(),
          1,
        );
        assert.equal(
          await panel.getByRole("button", { name: /^Turn Trial plug/ }).count(),
          0,
        );
        assert.equal(await homeA.serviceCalls(), 0);
        assert.equal(await homeB.serviceCalls(), 0);
      } finally {
        await context.close();
        await stopFixtures();
      }
    },
  );
  assert.equal(report.externalRequests, 0, "No external request is allowed");
  assert.deepEqual(report.pageErrors, [], "Browser errors fail the check");
  const failed = report.rows.filter((entry) => !entry.pass);
  assert.equal(failed.length, 0, `${failed.length} navigation row(s) failed`);
  report.result = "passed";
} catch (error) {
  report.failedStage = stage;
  report.failure = String(error.message)
    .replaceAll(root, "[source]")
    .replaceAll(temporary ?? "\0", "[temporary]")
    .slice(0, 1500);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  await stopFixtures();
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  report.artifacts = [];
  let bytes = 0;
  for (const file of pictures) {
    try {
      const size = (await stat(join(output, file))).size;
      bytes += size;
      report.artifacts.push({ file, bytes: size });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (bytes > 10 * 1024 * 1024) {
    for (const { file } of report.artifacts) await unlink(join(output, file));
    report.artifacts = [];
    report.result = "failed";
    report.failure = "Capture budget exceeded; captures removed";
    process.exitCode = 1;
  }
  try {
    report.revision = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    report.dirtySource = !!execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim();
  } catch {
    report.revision = "unrecorded";
  }
  report.serverAndBrowserClosed = true;
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
