// Detail workspace navigation proof (B02): URLs, Back/Forward, focus, Home and
// renderer instances on the public sample only. No HA, credentials or services.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
// Applies a proposed dependency fix to the disposable staging copy only.
const routerPatch = process.argv.includes("--with-proposed-router-patch")
  ? join(root, "scripts/fixtures/detail-panel/expo-router-history.patch")
  : null;
const controller = new AbortController();
let browser, server, temporary;
let stage = "prepare";
const report = {
  schema: 1,
  publicSampleOnly: true,
  realHaRequired: false,
  physicalServiceCalls: 0,
  proposedRouterPatch: null,
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
const deadline = setTimeout(stop, 12 * 60_000);

async function open(width) {
  const context = await browser.newContext({
    viewport: { width, height: 932 },
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === server.origin)
      return route.continue();
    report.externalRequests++;
    return route.abort();
  });
  await context.routeWebSocket("**/*", (socket) => {
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
    visibleHomes: await visible("home-overview"),
    panel: await visible("detail-panel"),
    summary: await visible("device-summary"),
    reading: await visible("reading-detail"),
    focus: await page.evaluate(() => document.activeElement?.id || null),
    renderers: await page.evaluate(() =>
      JSON.parse(document.documentElement.dataset.mauriceRenderers ?? "null"),
    ),
  };
}
async function row(name, expected, check) {
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
const lampPath = "/appliance/demo-plug?profile=demo";
const feederPath = "/appliance/demo-feeder?profile=demo";
const readingPath = "/device/demo-sensor.feeder_last?profile=demo";
const created = (state) => state.renderers?.created ?? 0;

try {
  await mkdir(output, { recursive: true });
  temporary = await mkdtemp(join(tmpdir(), "maurice-detail-panel-"));
  const workspace = join(temporary, "project");
  const cache = join(temporary, "cache");
  await mkdir(cache);
  await copyPublicSource(root, workspace);
  const env = publicEnvironment(process.env, cache);
  const options = { cwd: workspace, env, signal: controller.signal };
  stage = "install";
  await run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], options);
  if (routerPatch) {
    const patch = await readFile(routerPatch);
    report.proposedRouterPatch = createHash("sha256")
      .update(patch)
      .digest("hex");
    await run("patch", ["-p1", "--forward", "-i", routerPatch], options);
  }
  report.plan = await assertPublicPlan(workspace);
  stage = "export";
  await run(
    "npx",
    ["--no-install", "expo", "export", "--platform", "web"],
    options,
  );
  await assertPublicPlan(workspace);
  server = await previewServer(join(workspace, "dist"));
  browser = await chromium.launch({ headless: true });
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
    "Resize 1440 → 430 → 1024 → 1440 with a detail open",
    "Same URL and session; route presentation when narrow, panel when wide; at most one live renderer",
    async (step) => {
      const { context, page } = await open(1440);
      try {
        await demo(page);
        await card(page, "Living room lamp").click();
        await step("1440", page, (s) => assert.equal(s.panel, 1));
        for (const width of [430, 1024, 1440]) {
          await page.setViewportSize({ width, height: 932 });
          await step(String(width), page, (s) => {
            assert.equal(s.path, lampPath);
            assert.equal(s.summary, 1);
            assert.equal(s.panel, width === 1440 ? 1 : 0);
            assert.equal(s.visibleHomes, width === 1440 ? 1 : 0);
            assert(s.renderers.live <= 1 && s.renderers.peakLive <= 1);
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
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
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
    join(output, routerPatch ? "report-router-patch.json" : "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
