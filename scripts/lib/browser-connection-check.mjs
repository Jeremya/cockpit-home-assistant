import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect } from "@playwright/test";

/** Real browser -> official HA client -> closed loopback fixture, never household HA. */
export async function checkBrowserConnection({
  browser,
  origin,
  workspace,
  env,
  signal,
}) {
  const fixture = spawn(
    process.execPath,
    ["scripts/trial-ha-fixture.mjs", "0", "--power-proof"],
    {
      cwd: workspace,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const exited = new Promise((resolve) => fixture.once("exit", resolve));
  const stop = () => fixture.kill("SIGTERM");
  signal.addEventListener("abort", stop, { once: true });
  let context;
  try {
    const [bytes] = await once(fixture.stdout, "data", {
      signal: AbortSignal.timeout(15_000),
    });
    const { port, fixtureOnly } = JSON.parse(String(bytes));
    assert.equal(fixtureOnly, true);
    const fixtureOrigin = `http://127.0.0.1:${port}`;
    const fixtureSocket = `ws://127.0.0.1:${port}/api/websocket`;
    const status = async () =>
      (await fetch(fixtureOrigin + "/_proof/status")).json();
    const configure = async (update) => {
      const response = await fetch(fixtureOrigin + "/_proof/config", {
        method: "POST",
        body: JSON.stringify(update),
      });
      assert(response.ok);
    };
    context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    let unexpectedRequests = 0;
    const errors = [];
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin)
        return route.continue();
      unexpectedRequests++;
      return route.abort();
    });
    await context.routeWebSocket("**/*", (socket) => {
      if (socket.url() === fixtureSocket) socket.connectToServer();
      else {
        unexpectedRequests++;
        socket.close();
      }
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(10_000);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const connect = async () => {
      await nav.getByRole("link", { name: "Connection", exact: true }).click();
      await expect(
        page.getByText(/Your token stays in memory for this page only/),
      ).toBeVisible();
      await page
        .getByLabel("Home Assistant URL", { exact: true })
        .fill(fixtureOrigin);
      await page
        .getByLabel("Access token", { exact: true })
        .fill("maurice-trial-proof");
      await page
        .getByRole("switch", { name: "Trust local HTTP network", exact: true })
        .check();
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await expect(
        page
          .getByText("Synced with HA", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
    };
    const noPersistentToken = async () => {
      const serialized = await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
          url: location.href,
        }),
      );
      assert(
        !serialized.includes("maurice-trial-proof"),
        "Token must never enter browser persistence or the URL",
      );
    };
    await page.goto(origin);
    await connect();
    await noPersistentToken();
    await page
      .getByRole("button", { name: "Open device: Trial plug", exact: true })
      .click();
    const summary = page.getByTestId("device-summary");
    const on = summary.getByRole("button", {
      name: "Turn Trial plug on",
      exact: true,
    });
    const off = summary.getByRole("button", {
      name: "Turn Trial plug off",
      exact: true,
    });
    await expect(on).toBeDisabled();
    await expect(off).toBeDisabled();
    await summary
      .getByRole("button", { name: "Allow power control", exact: true })
      .click();
    await summary
      .getByRole("button", { name: "Cancel permission", exact: true })
      .click();
    assert.equal((await status()).counters.serviceCalls, 0);
    await summary
      .getByRole("button", { name: "Allow power control", exact: true })
      .click();
    await summary
      .getByRole("button", { name: "Allow this device", exact: true })
      .click();
    await expect(on).toBeEnabled();
    assert.equal((await status()).counters.serviceCalls, 0);
    await on.click();
    await expect(off).toBeEnabled();
    await expect(
      summary.getByText("On", { exact: true }).first(),
    ).toBeVisible();
    await off.click();
    await expect(on).toBeEnabled();
    assert.equal((await status()).counters.serviceCalls, 2);
    await configure({ online: false });
    await expect(
      summary.getByText("Cached observations", { exact: true }),
    ).toBeVisible();
    await expect(on).toBeDisabled();
    await configure({ online: true });
    await expect(on).toBeEnabled({ timeout: 25_000 });
    assert.equal(
      (await status()).counters.serviceCalls,
      2,
      "Reconnect must not replay power",
    );
    await noPersistentToken();
    const beforeReload = (await status()).counters.authentications;
    await page.goto(origin);
    await expect(
      page.getByRole("button", { name: "Connect Home Assistant", exact: true }),
    ).toBeVisible();
    // Wait for the common bootstrap, rather than treating a transient idle frame as success.
    assert.equal(
      (await status()).counters.authentications,
      beforeReload,
      "A reload must not reuse a credential",
    );
    await noPersistentToken();
    await connect();
    await page
      .getByRole("button", { name: "Open device: Trial plug", exact: true })
      .click();
    await expect(on).toBeEnabled();
    await expect(
      summary.getByRole("button", {
        name: "Revoke power control",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      (await status()).counters.serviceCalls,
      2,
      "Reload/reconnect must not replay power",
    );
    await nav.getByRole("link", { name: "Connection", exact: true }).click();
    await expect(page.getByLabel("Access token", { exact: true })).toHaveValue(
      "",
    );
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "Forget this Home Assistant", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Forget this Home Assistant",
        exact: true,
      }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Forget this Home Assistant", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Connect Home Assistant", exact: true }),
    ).toBeVisible();
    await noPersistentToken();
    assert.deepEqual(errors, []);
    assert.equal(unexpectedRequests, 0);
    return {
      fixtureOnly: true,
      browserHaConnection: true,
      credentialsMemoryOnly: true,
      reloadRequiresToken: true,
      preferencesAndExactGrantSurviveReload: true,
      defaultDenied: true,
      canceledReviewAndGrantSendNothing: true,
      simulatedServiceCalls: 2,
      recoveryWithoutReplay: true,
      nativeBrowserForgetCancelAndConfirm: true,
      pageErrors: 0,
      unexpectedRequests: 0,
      physicalServiceCalls: 0,
    };
  } finally {
    await context?.close();
    stop();
    const force = setTimeout(() => fixture.kill("SIGKILL"), 2000);
    await exited;
    clearTimeout(force);
    signal.removeEventListener("abort", stop);
  }
}
