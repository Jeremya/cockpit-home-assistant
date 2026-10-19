import assert from "node:assert/strict";
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
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import {
  assertPublicPlan,
  copyPublicSource,
  publicEnvironment,
  run,
} from "./lib/public-build.mjs";
import { previewServer } from "./lib/preview-server.mjs";

const root = process.cwd();
const output = join(root, "artifacts/ui");
const widths = [320, 430, 768];
const pictures = widths.flatMap((width) =>
  ["home", "plan", "control"].map((name) => `${name}-${width}.png`),
);
const allowedArtifacts = ["report.json", "failure.png", ...pictures];
const controller = new AbortController();
let browser, server, page, temporary;
let stage = "prepare";
let publicVerified = false;
const report = {
  schema: 1,
  publicSampleOnly: true,
  realHaRequired: false,
  physicalServiceCalls: 0,
  widths: [],
  pageErrors: [],
  pageErrorCount: 0,
  externalRequests: 0,
  result: "failed",
};
const originalPath = join(root, "src/spatial/current-plan.json");
const original = await readFile(originalPath).catch((error) => {
  if (error.code === "ENOENT") return null;
  throw error;
});
const stop = () => {
  controller.abort();
  void browser?.close();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const deadline = setTimeout(stop, 12 * 60_000);
const expect = playwrightExpect.configure({ timeout: 10_000 });

async function noOverflow(page) {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Page must fit the viewport",
  );
}
async function demo(page) {
  await page
    .getByRole("button", { name: "Explore demo home", exact: true })
    .click();
  await expect(
    page.getByText("Maurice · demo home", { exact: true }),
  ).toBeVisible();
}
async function home(page) {
  await page.goto(server.origin, { waitUntil: "networkidle" });
  await demo(page);
}

try {
  await mkdir(output, { recursive: true });
  for (const file of allowedArtifacts)
    await unlink(join(output, file)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  temporary = await mkdtemp(join(tmpdir(), "maurice-public-ui-"));
  const workspace = join(temporary, "project");
  const cache = join(temporary, "cache");
  await mkdir(cache);
  await copyPublicSource(root, workspace);
  const env = publicEnvironment(process.env, cache);
  const options = { cwd: workspace, env, signal: controller.signal };
  console.log("Public UI: install isolated lockfile and R01 patch");
  stage = "install";
  await run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], options);
  report.plan = await assertPublicPlan(workspace);
  console.log("Public UI: export sample with isolated transform cache");
  stage = "export";
  await run(
    "npx",
    [
      "--no-install",
      "expo",
      "export",
      "--platform",
      "web",
      "--output-dir",
      "build-web",
    ],
    options,
  );
  // A mutated/generated private plan must fail before any browser capture.
  await assertPublicPlan(workspace);
  publicVerified = true;
  const plan = JSON.parse(
    await readFile(join(workspace, "src/spatial/sample-plan.json"), "utf8"),
  );
  server = await previewServer(join(workspace, "build-web"));
  browser = await chromium.launch({ headless: true });
  report.chromium = browser.version();
  stage = "browser";
  for (const width of widths) {
    console.log(`Public UI: ${width}px`);
    const context = await browser.newContext({
      viewport: { width, height: 932 },
      serviceWorkers: "block",
    });
    try {
      // The fixture browser can only reach this disposable preview server.
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
      page = await context.newPage();
      page.setDefaultTimeout(10_000);
      page.on("pageerror", (error) => {
        report.pageErrorCount++;
        if (report.pageErrors.length < 10)
          report.pageErrors.push(error.message.slice(0, 1500));
      });
      await home(page);
      await noOverflow(page);
      await page.screenshot({ path: join(output, `home-${width}.png`) });
      await page
        .getByRole("button", {
          name: "Open Sample home floor plan",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("Sample floor plan", { exact: true }),
      ).toBeVisible();
      for (const floor of plan.floors) {
        await page.getByRole("tab", { name: floor.name, exact: true }).click();
        await expect(
          page.getByRole("tab", { name: floor.name, exact: true }),
        ).toHaveAttribute("aria-selected", "true");
        await expect(
          page.getByText("No dimensions supplied for this space.", {
            exact: true,
          }),
        ).toHaveCount(0);
        for (const room of floor.rooms)
          await expect(
            page.getByRole("button", {
              name: `Explore ${room.name}`,
              exact: true,
            }),
          ).toHaveAttribute("aria-pressed", "false");
        const room = floor.rooms[0];
        await page
          .getByTestId("house-scroll")
          .getByTestId(`plan-room-${room.id}`)
          .click();
        await expect(
          page.getByRole("button", {
            name: `Explore ${room.name}`,
            exact: true,
          }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(
          page.getByText("No dimensions supplied for this space.", {
            exact: true,
          }),
        ).toBeVisible();
        const other = floor.rooms[1];
        await page
          .getByRole("button", { name: `Explore ${other.name}`, exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: `Explore ${other.name}`,
            exact: true,
          }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(
          page.getByRole("button", {
            name: `Explore ${room.name}`,
            exact: true,
          }),
        ).toHaveAttribute("aria-pressed", "false");
        await noOverflow(page);
      }
      await page.getByRole("tab", { name: "Floor 1", exact: true }).click();
      await page
        .getByTestId("house-scroll")
        .getByTestId("plan-frame")
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(output, `plan-${width}.png`) });
      await page.goBack();
      await expect(
        page.getByText("Maurice · demo home", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Open device: Cat feeder", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Show all 7 readings", exact: true })
        .click();
      await expect(
        page.getByTestId("device-readings").getByRole("button"),
      ).toHaveCount(7);
      await page.getByRole("button", { name: /^Last distribution,/ }).click();
      await expect(
        page.getByText("Observation details", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Add to favorites", exact: true })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Remove from favorites",
          exact: true,
        }),
      ).toBeVisible();
      // Observe persistence through reload, rather than waiting an arbitrary delay.
      await expect
        .poll(() => page.evaluate(() => JSON.stringify(localStorage)))
        .toContain("demo-sensor.feeder_last");
      await home(page);
      await expect(page.getByText("Favorites", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: "Open device: Cat feeder",
          exact: true,
        }),
      ).toHaveCount(1);
      await page.getByRole("tab", { name: "Kitchen", exact: true }).click();
      await expect(
        page.getByRole("tab", { name: "Kitchen", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("button", {
          name: "Open device: Cat feeder",
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(page.getByText("Favorites", { exact: true })).toHaveCount(0);
      await page.getByRole("tab", { name: "All rooms", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Open device: Living room lamp",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Show all 1 readings", exact: true })
        .click();
      await page.getByRole("button", { name: /^Living room lamp,/ }).click();
      const on = page.getByRole("button", {
        name: "Turn Living room lamp on",
        exact: true,
      });
      const off = page.getByRole("button", {
        name: "Turn Living room lamp off",
        exact: true,
      });
      await expect(on).toBeEnabled();
      await expect(off).toBeDisabled();
      for (const target of [on, off]) {
        await target.scrollIntoViewIfNeeded();
        const box = await target.boundingBox();
        assert(
          box.width >= 48 &&
            box.height >= 48 &&
            box.x >= 0 &&
            box.x + box.width <= width + 1,
          "Switch target must fit and be at least 48px",
        );
      }
      await noOverflow(page);
      await page.waitForLoadState("networkidle");
      await context.setOffline(true);
      await on.click();
      await expect(
        page.getByText("Simulated state observed after the request.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(on).toBeDisabled();
      await expect(off).toBeEnabled();
      await page
        .getByRole("button", { name: "Dismiss result", exact: true })
        .click();
      await expect(page.getByTestId("switch-outcome")).toHaveCount(0);
      await off.click();
      await expect(
        page.getByText("Simulated state observed after the request.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(off).toBeDisabled();
      await expect(on).toBeEnabled();
      await page.screenshot({ path: join(output, `control-${width}.png`) });
      await page.goBack();
      await page.goBack();
      await page
        .getByRole("button", {
          name: "Open Sample home floor plan",
          exact: true,
        })
        .click();
      await page.getByRole("tab", { name: "Floor 2", exact: true }).click();
      await page
        .getByRole("button", { name: "Explore Bedroom", exact: true })
        .click();
      await expect(
        page.getByText("No dimensions supplied for this space.", {
          exact: true,
        }),
      ).toBeVisible();
      await context.setOffline(false);
      // A full direct route load uses the SPA fallback, not a fresh offline claim.
      await page.goto(server.origin + "/house", { waitUntil: "networkidle" });
      await expect(
        page.getByText("Sample floor plan", { exact: true }),
      ).toBeVisible();
      report.widths.push({
        width,
        homePlanAndBack: true,
        allFloorsAndPolygonSelection: true,
        selectedTabsAndRoomList: true,
        unknownDimensions: true,
        deviceReadingsAndFavoritePersistence: true,
        simulatedOnOffAndDismissal: true,
        targets48px: true,
        loadedRoutesWorkOffline: true,
        directHouseRoute: true,
        noHorizontalOverflow: true,
      });
    } catch (error) {
      if (page && !page.isClosed())
        await page
          .screenshot({ path: join(output, "failure.png") })
          .catch(() => {});
      throw error;
    } finally {
      await context.close();
      page = undefined;
    }
  }
  assert.equal(
    report.externalRequests,
    0,
    "Demo must not request external services",
  );
  assert.deepEqual(report.pageErrors, [], "Browser errors must fail the smoke");
  report.result = "passed";
} catch (error) {
  report.failedStage = stage;
  report.failure = String(error.message)
    .replaceAll(root, "[source]")
    .replaceAll(temporary ?? "\0", "[temporary]")
    .slice(0, 3000);
  if (publicVerified && page && !page.isClosed())
    await page
      .screenshot({ path: join(output, "failure.png") })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  await browser?.close();
  await server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  const after = await readFile(originalPath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  report.developerPlanUnchanged =
    original === null ? after === null : original.equals(after);
  if (!report.developerPlanUnchanged) {
    report.result = "failed";
    process.exitCode = 1;
  }
  report.artifacts = [];
  let bytes = 0;
  for (const file of ["failure.png", ...pictures]) {
    try {
      const size = (await stat(join(output, file))).size;
      bytes += size;
      report.artifacts.push({ file, bytes: size });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (bytes > 20 * 1024 * 1024) {
    for (const { file } of report.artifacts) await unlink(join(output, file));
    report.artifacts = [];
    report.failure = "UI capture budget exceeded; captures removed";
    report.result = "failed";
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
  console.log(JSON.stringify(report));
}
