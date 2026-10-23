// Browser sign-in recette (C04): request and callback, memory versus opt-in,
// profile restart, renewal, tabs, quota, corrupt record and user change.
// Only the public auth fixture on loopback; no household HA, token or service.
// `--app <origin>` reuses a running app (development only); the default
// stages the public source, exports the web build and serves it.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
  assertPublicPlan,
  copyPublicSource,
  publicEnvironment,
  run,
} from "./lib/public-build.mjs";
import { previewServer } from "./lib/preview-server.mjs";
import { PUBLIC_USERS, redactSecrets } from "./lib/web-auth-fixture.mjs";

const root = process.cwd();
const output = join(root, "artifacts/web-auth");
const pictures = [
  "settings-remembered.png",
  "signed-out-elsewhere.png",
  "a03-signed-out.png",
];
const appArgument = process.argv.indexOf("--app");
const reusedApp =
  appArgument === -1
    ? undefined
    : new URL(process.argv[appArgument + 1]).origin;
// Access tokens expire quickly so a reconnect must renew one.
const ACCESS_LIFETIME = 4;
const SECRET = /maurice-fixture-(access|refresh)-|code=[0-9a-f]{32}/;
// URLs: the callback carries HA's code by design; tokens must never appear.
const TOKEN = /maurice-fixture-(access|refresh)-/;
const password = PUBLIC_USERS[0].password;
const controller = new AbortController();
let browser, server, temporary, workspace, env, fixture, app, ha;
const contexts = new Set();
let stage = "prepare";
let consoleSecrets = 0;
const report = {
  schema: 1,
  fixtureOnly: true,
  realHaRequired: false,
  physicalServiceCalls: 0,
  staged: !reusedApp,
  rows: [],
  pageErrors: [],
  externalRequests: 0,
  result: "failed",
};
const stop = () => {
  controller.abort();
  void browser?.close();
  // Persistent profiles run their own browser.
  for (const context of contexts) void context.close().catch(() => {});
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

async function startFixture() {
  const child = spawn(
    process.execPath,
    [
      "scripts/lib/web-auth-fixture.mjs",
      "--serve",
      "--access-lifetime",
      String(ACCESS_LIFETIME),
    ],
    { cwd: workspace, env, stdio: ["ignore", "pipe", "inherit"] },
  );
  // Even if this runner dies before its cleanup, the fixture goes with it.
  process.once("exit", () => child.kill());
  const [bytes] = await once(child.stdout, "data", {
    signal: AbortSignal.timeout(15_000),
  });
  const ready = JSON.parse(String(bytes));
  assert.equal(ready.fixtureOnly, true);
  return { child, origin: ready.origin };
}
const stats = async () =>
  (await fetch(`${ha}/_fixture/status`, { cache: "no-store" })).json();

function watch(context) {
  contexts.add(context);
  const socket = `${ha.replace(/^http/, "ws")}/api/websocket`;
  return Promise.all([
    context.route("**/*", (route) => {
      const { origin } = new URL(route.request().url());
      if (origin === app || origin === ha) return route.continue();
      report.externalRequests++;
      return route.abort();
    }),
    // Only the fixture socket; a reused development server also has its own.
    context.routeWebSocket("**/*", (ws) => {
      const url = new URL(ws.url());
      if (ws.url() === socket || (reusedApp && url.host === new URL(app).host))
        return ws.connectToServer();
      report.externalRequests++;
      ws.close();
    }),
  ]);
}
function track(page) {
  page.setDefaultTimeout(15_000);
  page.on("console", (message) => {
    if (SECRET.test(message.text())) consoleSecrets++;
  });
  page.on("pageerror", (error) => {
    if (report.pageErrors.length < 10)
      report.pageErrors.push(redactSecrets(error.message).slice(0, 500));
  });
  page.on("dialog", (dialog) => void dialog.accept());
  return page;
}
async function fresh() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
  });
  await watch(context);
  return { context, page: track(await context.newPage()) };
}
/** A browser profile on disk, so closing it is a real browser restart. */
async function persistent(directory, width = 1280) {
  const context = await chromium.launchPersistentContext(directory, {
    ...ownSignals,
    headless: true,
    viewport: { width, height: 900 },
    serviceWorkers: "block",
  });
  await watch(context);
  return {
    context,
    page: track(context.pages()[0] ?? (await context.newPage())),
  };
}
const visible = (locator) => locator.filter({ visible: true }).first();
const synced = (page) =>
  expect(
    visible(page.getByText("Synced with HA", { exact: true })),
  ).toBeVisible();
const connectButton = (page) =>
  visible(
    page.getByRole("button", { name: "Connect Home Assistant", exact: true }),
  );
async function settings(page) {
  await visible(page.getByRole("navigation", { name: "Main navigation" }))
    .getByRole("link", { name: "Connection", exact: true })
    .click();
  await visible(
    page.getByLabel("Home Assistant URL", { exact: true }),
  ).waitFor();
}
/** Settings → HA's own login page → back to Home. Returns the authorize URL. */
async function signIn(
  page,
  { user = "alice", remember = false, beforeRedirect } = {},
) {
  await page.goto(`${app}/settings`, { waitUntil: "networkidle" });
  await page.getByLabel("Home Assistant URL", { exact: true }).fill(ha);
  await page
    .getByRole("switch", { name: "Trust local HTTP network", exact: true })
    .check();
  const box = page.getByRole("switch", {
    name: "Remember this browser",
    exact: true,
  });
  const unchecked = !(await box.isChecked());
  if (remember) await box.check();
  await beforeRedirect?.();
  await page
    .getByRole("button", { name: "Sign in with Home Assistant", exact: true })
    .click();
  await page.waitForURL(`${ha}/auth/authorize?**`);
  const authorize = new URL(page.url());
  await page.getByLabel("Username").fill(user);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(`${app}/`);
  await synced(page);
  return { authorize, unchecked };
}
/** This origin's storage as shapes and booleans; no value is returned. */
const storage = (page) =>
  page.evaluate(async () => {
    // Never create the app's database: a missing one is simply empty.
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("maurice-auth");
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    });
    const all = (name) =>
      db?.objectStoreNames.contains(name)
        ? new Promise((resolve) => {
            const request = db.transaction(name).objectStore(name).getAll();
            request.onsuccess = () => resolve(request.result);
          })
        : Promise.resolve([]);
    const sessions = await all("sessions");
    const signOuts = await all("signOuts");
    db?.close();
    const web =
      JSON.stringify({ ...localStorage }) +
      JSON.stringify({ ...sessionStorage }) +
      document.cookie;
    return {
      sessions: sessions.length,
      fields: sessions.map((s) => Object.keys(s).sort().join()),
      refreshTokenOnly: sessions.every(
        (s) =>
          /^maurice-fixture-refresh-/.test(s.refreshToken) &&
          !JSON.stringify(s).includes("maurice-fixture-access-"),
      ),
      signOutSeq: signOuts.map((s) => s.seq),
      tokenInWebStorageOrCookies: /maurice-fixture-(access|refresh)-/.test(web),
      pendingTransaction: Object.keys(sessionStorage).includes(
        "maurice.auth.transaction.v1",
      ),
    };
  });
const corrupt = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        // Same schema as the app, in case it has not opened it yet.
        const request = indexedDB.open("maurice-auth", 1);
        request.onupgradeneeded = () => {
          for (const name of ["sessions", "signOuts"])
            request.result.createObjectStore(name, { keyPath: "profileId" });
        };
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction("sessions", "readwrite");
          transaction.objectStore("sessions").put({
            profileId: "ha:http://127.0.0.1:9",
            version: 9,
            refreshToken: "public-corrupt-value",
          });
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(new Error("write failed"));
        };
      }),
  );
async function capture(page, file) {
  assert(!SECRET.test(await page.content()), "A capture must show no secret");
  await page.screenshot({ path: join(output, file) });
}
async function allowPlug(page) {
  await visible(
    page.getByRole("button", {
      name: "Open device: Fixture plug",
      exact: true,
    }),
  ).click();
  const summary = visible(page.getByTestId("device-summary"));
  await summary
    .getByRole("button", { name: "Allow power control", exact: true })
    .click();
  await summary
    .getByRole("button", { name: "Allow this device", exact: true })
    .click();
  const on = summary.getByRole("button", {
    name: "Turn Fixture plug on",
    exact: true,
  });
  await expect(on).toBeEnabled();
  return on;
}
async function row(name, expected, check) {
  // Interrupted: no further row starts; the run fails and cleans up.
  controller.signal.throwIfAborted();
  const entry = { name, expected, observed: {}, pass: false };
  report.rows.push(entry);
  try {
    await check(entry.observed);
    entry.pass = true;
  } catch (error) {
    // The first line and Playwright's locator line name what was missing.
    const lines = String(error.message).split("\n");
    entry.failure = redactSecrets(
      [lines[0], lines.find((line) => line.startsWith("Locator:"))]
        .filter(Boolean)
        .join(" "),
    ).slice(0, 400);
  }
}

try {
  await mkdir(output, { recursive: true });
  for (const file of [...pictures, "report.json"])
    await unlink(join(output, file)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  temporary = await mkdtemp(join(tmpdir(), "maurice-web-auth-"));
  if (reusedApp) {
    workspace = root;
    env = process.env;
    app = reusedApp;
  } else {
    workspace = join(temporary, "project");
    const cache = join(temporary, "cache");
    await mkdir(cache);
    await copyPublicSource(root, workspace);
    env = publicEnvironment(process.env, cache);
    const options = { cwd: workspace, env, signal: controller.signal };
    stage = "install";
    await run(
      "npm",
      ["ci", "--include=dev", "--no-audit", "--no-fund"],
      options,
    );
    report.plan = await assertPublicPlan(workspace);
    stage = "export";
    await run(
      "npx",
      ["--no-install", "expo", "export", "--platform", "web"],
      options,
    );
    await assertPublicPlan(workspace);
    server = await previewServer(join(workspace, "dist"));
    app = server.origin;
  }
  stage = "fixture";
  fixture = await startFixture();
  ha = fixture.origin;
  browser = await chromium.launch({ ...ownSignals, headless: true });
  report.chromium = browser.version();
  stage = "browser";
  const profile = join(temporary, "browser-profile");

  let callback;
  await row(
    "Sign-in request",
    "HA's authorize page gets this app as client, its callback, a fresh state and an S256 challenge; the verifier stays in the tab",
    async (seen) => {
      const { context, page } = await fresh();
      try {
        page.on("request", (request) => {
          if (
            request.isNavigationRequest() &&
            request.url().startsWith(`${app}/auth-callback?`)
          )
            callback = request.url();
        });
        // Reported by the app document when it writes the pending sign-in:
        // a boolean only (present, and free of tokens).
        let pending;
        page.on("console", (message) => {
          const match = /^maurice-check:transaction:(true|false)$/.exec(
            message.text(),
          );
          if (match) pending = match[1] === "true";
        });
        const { authorize, unchecked } = await signIn(page, {
          beforeRedirect: () =>
            page.evaluate(() => {
              const write = Storage.prototype.setItem;
              Storage.prototype.setItem = function (key, value) {
                write.call(this, key, value);
                if (
                  this === sessionStorage &&
                  key === "maurice.auth.transaction.v1"
                )
                  console.log(
                    `maurice-check:transaction:${!/maurice-fixture-/.test(value)}`,
                  );
              };
            }),
        });
        const params = Object.fromEntries(authorize.searchParams);
        seen.parameters = Object.keys(params).sort();
        assert.deepEqual(seen.parameters, [
          "client_id",
          "code_challenge",
          "code_challenge_method",
          "redirect_uri",
          "response_type",
          "state",
        ]);
        assert.equal(params.client_id, `${app}/`);
        assert.equal(params.redirect_uri, `${app}/auth-callback`);
        assert.equal(params.response_type, "code");
        assert.equal(params.code_challenge_method, "S256");
        assert.match(params.state, /^[A-Za-z0-9_-]{43}$/);
        assert.match(params.code_challenge, /^[A-Za-z0-9_-]{43}$/);
        seen.rememberUncheckedByDefault = unchecked;
        assert.equal(unchecked, true);
        seen.transactionDuringRedirect = pending;
        assert.equal(pending, true);
        seen.landing =
          new URL(page.url()).pathname + new URL(page.url()).search;
        assert.equal(seen.landing, "/");
        const after = await storage(page);
        seen.transactionAfterCallback = after.pendingTransaction;
        assert.equal(after.pendingTransaction, false);
        await page.goBack();
        seen.backReachesAuthorizeWithoutCode =
          page.url().startsWith(`${ha}/auth/authorize?`) &&
          !page.url().includes("code=");
        assert(seen.backReachesAuthorizeWithoutCode);
        assert(callback, "callback observed");
      } finally {
        await context.close();
      }
    },
  );

  await row(
    "Memory by default",
    "No record is kept; reloading asks to sign in again and leaving the page revokes the sign-in",
    async (seen) => {
      const { context, page } = await fresh();
      try {
        await signIn(page);
        const kept = await storage(page);
        seen.records = kept.sessions;
        seen.tokenInWebStorageOrCookies = kept.tokenInWebStorageOrCookies;
        assert.equal(kept.sessions, 0);
        assert.equal(kept.tokenInWebStorageOrCookies, false);
        await page.reload();
        await expect(connectButton(page)).toBeVisible();
        await expect
          .poll(async () => (await stats()).activeRefreshTokens)
          .toBe(0);
        seen.revokedOnLeave = true;
      } finally {
        await context.close();
      }
    },
  );

  await row(
    "Used or forged callback",
    "A replayed callback and a callback with another state are refused without any code exchange, and leave a clean address",
    async (seen) => {
      const { context, page } = await fresh();
      try {
        const exchanged = (await stats()).codesExchanged;
        await page.goto(callback);
        await expect(
          page.getByText(
            "This sign-in was already used or did not start on this page. Sign in again.",
          ),
        ).toBeVisible();
        seen.replayAddress = new URL(page.url()).search;
        assert.equal(seen.replayAddress, "");
        // A sign-in is pending; a callback with a different state burns it.
        await page.goto(`${app}/settings`, { waitUntil: "networkidle" });
        await page.getByLabel("Home Assistant URL", { exact: true }).fill(ha);
        await page
          .getByRole("switch", {
            name: "Trust local HTTP network",
            exact: true,
          })
          .check();
        await page
          .getByRole("button", {
            name: "Sign in with Home Assistant",
            exact: true,
          })
          .click();
        await page.waitForURL(`${ha}/auth/authorize?**`);
        await page.goto(
          `${app}/auth-callback?code=${"0".repeat(32)}&state=${"A".repeat(43)}`,
        );
        await expect(
          page.getByText(
            "This sign-in does not match the one started on this page. Sign in again.",
          ),
        ).toBeVisible();
        seen.forgedAddress = new URL(page.url()).search;
        assert.equal(seen.forgedAddress, "");
        seen.exchanges = (await stats()).codesExchanged - exchanged;
        assert.equal(seen.exchanges, 0);
      } finally {
        await context.close();
      }
    },
  );

  await row(
    "Remember this browser",
    "Opting in keeps one record with the documented fields and the refresh token only, nothing in web storage or cookies; reloading reconnects without a new code",
    async (seen) => {
      const { context, page } = await persistent(profile);
      try {
        await signIn(page, { remember: true });
        const kept = await storage(page);
        seen.records = kept.sessions;
        seen.fields = kept.fields;
        seen.refreshTokenOnly = kept.refreshTokenOnly;
        seen.tokenInWebStorageOrCookies = kept.tokenInWebStorageOrCookies;
        assert.equal(kept.sessions, 1);
        assert.deepEqual(kept.fields, [
          "allowInsecureHttp,clientId,hassUrl,principal,profileId,refreshToken,rememberedAt,version",
        ]);
        assert.equal(kept.refreshTokenOnly, true);
        assert.equal(kept.tokenInWebStorageOrCookies, false);
        await settings(page);
        const status = visible(
          page.getByText(/This browser remembers this sign-in/),
        );
        await expect(status).toBeVisible();
        await status.scrollIntoViewIfNeeded();
        await capture(page, "settings-remembered.png");
        // Leaving the page must not revoke what this browser remembers.
        const before = await stats();
        await page.goto(`${app}/`, { waitUntil: "networkidle" });
        await synced(page);
        const after = await stats();
        seen.reloadNewCodes = after.codesExchanged - before.codesExchanged;
        seen.reloadRevocations = after.revocations - before.revocations;
        assert.equal(seen.reloadNewCodes, 0);
        assert.equal(seen.reloadRevocations, 0);
      } finally {
        // Closing the tab runs its unload handlers, as a user closing it would.
        await page.close({ runBeforeUnload: true }).catch(() => undefined);
        await context.close();
        contexts.delete(context);
      }
    },
  );

  await row(
    "Browser restart",
    "Closing the browser keeps the sign-in; reopening the profile reaches the same home without a new code, after a refresh",
    async (seen) => {
      const before = await stats();
      seen.keptWhileClosed = before.activeRefreshTokens >= 1;
      assert(seen.keptWhileClosed);
      const { context, page } = await persistent(profile);
      try {
        await page.goto(`${app}/`, { waitUntil: "networkidle" });
        await synced(page);
        const after = await stats();
        seen.newCodes = after.codesExchanged - before.codesExchanged;
        seen.refreshes = after.refreshGrants - before.refreshGrants;
        assert.equal(seen.newCodes, 0);
        assert(seen.refreshes >= 1, "restored by a refresh");
        await settings(page);
        seen.sameHome =
          (await page
            .getByLabel("Home Assistant URL", { exact: true })
            .inputValue()) === ha;
        assert(seen.sameHome);
      } finally {
        await context.close();
        contexts.delete(context);
      }
    },
  );

  await row(
    "Renewal on reconnect",
    "After the access token expired, Home Assistant dropping the socket leads to one refresh and a new synchronization, with no new code",
    async (seen) => {
      const { context, page } = await persistent(profile);
      try {
        await page.goto(`${app}/`, { waitUntil: "networkidle" });
        await synced(page);
        await page.waitForTimeout((ACCESS_LIFETIME + 1) * 1000);
        const before = await stats();
        const dropped = await (
          await fetch(`${ha}/_fixture/drop-sockets`, { method: "POST" })
        ).json();
        seen.droppedSockets = dropped.dropped;
        await expect
          .poll(async () => (await stats()).refreshGrants)
          .toBeGreaterThan(before.refreshGrants);
        await expect
          .poll(async () => (await stats()).wsAuthentications)
          .toBeGreaterThan(before.wsAuthentications);
        await synced(page);
        const after = await stats();
        seen.newCodes = after.codesExchanged - before.codesExchanged;
        assert.equal(seen.newCodes, 0);
      } finally {
        await context.close();
        contexts.delete(context);
      }
    },
  );

  await row(
    "Sign out in another tab",
    "Signing out in one tab ends the other tab's session; its old panel and tap send nothing; the record is gone and the token revoked",
    async (seen) => {
      const { context, page } = await persistent(profile);
      try {
        await page.goto(`${app}/`, { waitUntil: "networkidle" });
        await synced(page);
        await allowPlug(page);
        const other = track(await context.newPage());
        await other.goto(`${app}/`, { waitUntil: "networkidle" });
        await synced(other);
        await visible(
          other.getByRole("button", {
            name: "Open device: Fixture plug",
            exact: true,
          }),
        ).click();
        const oldTap = visible(other.getByTestId("device-summary")).getByRole(
          "button",
          { name: "Turn Fixture plug on", exact: true },
        );
        await expect(oldTap).toBeEnabled();
        await settings(page);
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await expect(
          page.getByText("Signed out.", { exact: true }),
        ).toBeVisible();
        // The old control is gone or disabled; even a forced tap sends nothing.
        await expect
          .poll(
            async () =>
              (await oldTap.count()) === 0 || !(await oldTap.isEnabled()),
          )
          .toBe(true);
        await oldTap
          .click({ timeout: 1000, force: true })
          .catch(() => undefined);
        await capture(other, "signed-out-elsewhere.png");
        await settings(other);
        seen.otherTabNotice = await visible(
          other.getByText("Signed out of Home Assistant in another tab."),
        ).isVisible();
        assert(seen.otherTabNotice);
        const kept = await storage(page);
        seen.records = kept.sessions;
        seen.signOutSeq = kept.signOutSeq;
        assert.equal(kept.sessions, 0);
        assert.deepEqual(kept.signOutSeq, [1]);
        await expect
          .poll(async () => (await stats()).activeRefreshTokens)
          .toBe(0);
        seen.serviceCalls = (await stats()).serviceCalls;
        assert.equal(seen.serviceCalls, 0);
      } finally {
        await context.close();
        contexts.delete(context);
      }
    },
  );

  await row(
    "Stop remembering",
    "The record is deleted while this page stays signed in; the next load asks to sign in and the token is revoked",
    async (seen) => {
      const { context, page } = await persistent(profile);
      try {
        await signIn(page, { remember: true });
        await settings(page);
        await page
          .getByRole("button", {
            name: "Stop remembering this browser",
            exact: true,
          })
          .click();
        await expect(
          page.getByText(
            "This browser no longer remembers the sign-in. This page stays signed in until it is closed.",
          ),
        ).toBeVisible();
        await expect(
          visible(page.getByText(/You are signed in for this page only/)),
        ).toBeVisible();
        seen.records = (await storage(page)).sessions;
        assert.equal(seen.records, 0);
        await page.goto(`${app}/`, { waitUntil: "networkidle" });
        await expect(connectButton(page)).toBeVisible();
        await expect
          .poll(async () => (await stats()).activeRefreshTokens)
          .toBe(0);
        seen.revokedOnLeave = true;
      } finally {
        await context.close();
        contexts.delete(context);
      }
    },
  );

  await row(
    "Storage write refused",
    "When IndexedDB aborts the write (injected at put, as a quota failure would; this headless Chromium ignores CDP quota overrides), remembering fails visibly, the page stays signed in for this page only, and no record exists",
    async (seen) => {
      const { context, page } = await fresh();
      try {
        await context.addInitScript(() => {
          const put = IDBObjectStore.prototype.put;
          // Like a quota failure: the write's transaction aborts.
          IDBObjectStore.prototype.put = function (...args) {
            const request = put.apply(this, args);
            if (this.name === "sessions") this.transaction.abort();
            return request;
          };
        });
        await signIn(page, { remember: true });
        await settings(page);
        await expect(
          visible(
            page.getByText(
              "This browser could not remember the sign-in. You stay signed in on this page only.",
            ),
          ),
        ).toBeVisible();
        await expect(
          visible(page.getByText(/You are signed in for this page only/)),
        ).toBeVisible();
        seen.records = (await storage(page)).sessions;
        assert.equal(seen.records, 0);
        await page.goto(`${app}/`, { waitUntil: "networkidle" });
        await expect(connectButton(page)).toBeVisible();
        await expect
          .poll(async () => (await stats()).activeRefreshTokens)
          .toBe(0);
        seen.revokedOnLeave = true;
      } finally {
        await context.close();
      }
    },
  );

  await row(
    "Corrupt record",
    "An unreadable record is deleted at start and reported without its contents",
    async (seen) => {
      const { context, page } = await fresh();
      try {
        await page.goto(`${app}/`, { waitUntil: "networkidle" });
        await corrupt(page);
        await page.goto(`${app}/settings`, { waitUntil: "networkidle" });
        await expect(
          visible(
            page.getByText(
              "The sign-in this browser remembered could not be read and was removed. Sign in again.",
            ),
          ),
        ).toBeVisible();
        seen.contentsShown = (await page.content()).includes(
          "public-corrupt-value",
        );
        assert.equal(seen.contentsShown, false);
        seen.records = (await storage(page)).sessions;
        assert.equal(seen.records, 0);
      } finally {
        await context.close();
      }
    },
  );

  await row(
    "Another Home Assistant user",
    "Bob signing in to Alice's home resets her power permission with a notice that names it; Bob must allow the plug himself",
    async (seen) => {
      const { context, page } = await fresh();
      try {
        await signIn(page, { user: "alice" });
        await allowPlug(page);
        await signIn(page, { user: "bob" });
        await settings(page);
        await expect(
          visible(
            page.getByText(
              "Power permissions for this home were reset because a different Home Assistant user signed in.",
            ),
          ),
        ).toBeVisible();
        // In-app navigation: a reload would end Bob's memory sign-in.
        await visible(page.getByRole("navigation", { name: "Main navigation" }))
          .getByRole("link", { name: "Overview", exact: true })
          .click();
        await synced(page);
        await visible(
          page.getByRole("button", {
            name: "Open device: Fixture plug",
            exact: true,
          }),
        ).click();
        await expect(
          visible(page.getByTestId("device-summary")).getByRole("button", {
            name: "Allow power control",
            exact: true,
          }),
        ).toBeVisible();
        seen.serviceCalls = (await stats()).serviceCalls;
        assert.equal(seen.serviceCalls, 0);
      } finally {
        await context.close();
      }
    },
  );

  await row(
    "Integrated end-to-end (A03)",
    "At 1440 px: remembered sign-in → Home (one scene, one renderer) → allow the plug in the panel → reading → panel Back → Close (focus on the origin card, B's contract) → reload keeps the profile and the exact grant → sign-out in tab B leaves tab A's old panel and card tap inert; one fixture socket per tab, no token in any URL",
    async (seen) => {
      const { context, page } = await persistent(
        join(temporary, "a03-profile"),
        1440,
      );
      const urlsWithToken = [];
      // One session per tab: each document counts its own fixture sockets.
      await context.addInitScript(
        (socketUrl) => {
          const Native = window.WebSocket;
          const counts = { created: 0, open: 0, peak: 0 };
          window.__mauriceFixtureSockets = counts;
          window.WebSocket = class extends Native {
            constructor(url, protocols) {
              super(url, protocols);
              if (String(url) !== socketUrl) return;
              counts.created++;
              counts.peak = Math.max(counts.peak, ++counts.open);
              this.addEventListener("close", () => counts.open--);
            }
          };
        },
        `${ha.replace(/^http/, "ws")}/api/websocket`,
      );
      const sockets = new Map();
      const follow = (target) => {
        sockets.set(target, { created: 0, peak: 0 });
        target.on("request", (request) => {
          if (TOKEN.test(request.url())) urlsWithToken.push(request.method());
        });
        return target;
      };
      const renderers = (target) =>
        target.evaluate(() =>
          JSON.parse(
            document.documentElement.dataset.mauriceRenderers ??
              '{"live":0,"peakLive":0,"created":0}',
          ),
        );
      const peakLive = [];
      const look = async (target) => {
        const counted = await renderers(target);
        peakLive.push(counted.peakLive);
        const socket = await target.evaluate(
          () => window.__mauriceFixtureSockets,
        );
        const tab = sockets.get(target);
        tab.created = Math.max(tab.created, socket.created);
        tab.peak = Math.max(tab.peak, socket.peak);
        assert(counted.live <= 1, "At most one live renderer");
        assert(!/[?&](code|state)=/.test(target.url()), "Clean address");
        return counted;
      };
      const panel = page.getByTestId("detail-panel");
      const plugCard = visible(
        page.getByRole("button", {
          name: "Open device: Fixture plug",
          exact: true,
        }),
      );
      const profileOf = (target) =>
        new URL(target.url()).searchParams.get("profile");
      const grant = (target, profileId) =>
        target.evaluate((id) => {
          const file = JSON.parse(localStorage.getItem("prefs") ?? "{}");
          return JSON.stringify(file.profiles?.[id]?.switchEnrollments ?? {});
        }, profileId);
      try {
        follow(page);
        // 1. Remembered sign-in; Home shows exactly one scene.
        await signIn(page, { remember: true });
        seen.visibleScenes = await page
          .locator("[data-s01-scene]")
          .filter({ visible: true })
          .count();
        assert.equal(seen.visibleScenes, 1);
        seen.liveRenderersAtHome = (await look(page)).live;
        assert.equal(seen.liveRenderersAtHome, 1);
        // 2. Allow power from the plug's detail, in the panel beside Home.
        const originId = await plugCard.getAttribute("id");
        await plugCard.click();
        await expect(panel).toBeVisible();
        seen.homeBesidePanel = await page
          .getByTestId("home-overview")
          .filter({ visible: true })
          .count();
        assert.equal(seen.homeBesidePanel, 1);
        const profileId = profileOf(page);
        assert(profileId?.startsWith("ha:"), "Panel URL names the profile");
        await panel
          .getByRole("button", { name: "Allow power control", exact: true })
          .click();
        await panel
          .getByRole("button", { name: "Allow this device", exact: true })
          .click();
        await expect(
          panel.getByRole("button", {
            name: "Turn Fixture plug on",
            exact: true,
          }),
        ).toBeEnabled();
        const granted = await grant(page, profileId);
        assert.notEqual(granted, "{}", "The grant is saved");
        // 3. Reading, panel Back, Close: focus returns to the origin card.
        await panel
          .getByRole("button", { name: "Show all 1 readings", exact: true })
          .click();
        await panel.getByRole("button", { name: /^Fixture plug,/ }).click();
        seen.readingPath = new URL(page.url()).pathname;
        assert(seen.readingPath.startsWith("/device/"), "Reading opened");
        await panel
          .getByRole("button", { name: "Back to previous detail", exact: true })
          .click();
        seen.backPath = new URL(page.url()).pathname;
        assert.equal(seen.backPath, "/appliance/fixture-plug");
        await panel
          .getByRole("button", { name: "Close details", exact: true })
          .click();
        await expect(panel).toBeHidden();
        seen.closedPath = new URL(page.url()).pathname;
        assert.equal(seen.closedPath, "/");
        // Focus is restored after the panel unmounts, within a few frames.
        await expect
          .poll(() => page.evaluate(() => document.activeElement?.id))
          .toBe(originId);
        seen.focusOnOriginCard = true;
        await look(page);
        // 4. Reload: same profile and the exact grant, without re-enrolling.
        const before = await stats();
        await page.reload({ waitUntil: "networkidle" });
        await synced(page);
        const cardTap = visible(
          page.getByRole("button", {
            name: "Turn Fixture plug on",
            exact: true,
          }),
        );
        await expect(cardTap).toBeEnabled();
        seen.sameGrant = (await grant(page, profileId)) === granted;
        assert(seen.sameGrant, "The exact grant survives, unchanged");
        // 5. Plug detail open in tab A; tab B restores and signs out.
        await plugCard.click();
        await expect(panel).toBeVisible();
        seen.sameProfile = profileOf(page) === profileId;
        assert(seen.sameProfile, "Same profile after reload");
        const after = await stats();
        seen.reloadNewCodes = after.codesExchanged - before.codesExchanged;
        assert.equal(seen.reloadNewCodes, 0);
        const panelTap = panel.getByRole("button", {
          name: "Turn Fixture plug on",
          exact: true,
        });
        await expect(panelTap).toBeEnabled();
        await look(page);
        const other = follow(track(await context.newPage()));
        await other.goto(`${app}/`, { waitUntil: "networkidle" });
        await synced(other);
        await look(other);
        await settings(other);
        await other
          .getByRole("button", { name: "Sign out", exact: true })
          .click();
        await expect(
          other.getByText("Signed out.", { exact: true }),
        ).toBeVisible();
        // 6. Tab A: the old panel and the old card tap are inert.
        const inert = async (tap) => {
          await expect
            .poll(
              async () => (await tap.count()) === 0 || !(await tap.isEnabled()),
            )
            .toBe(true);
          await tap.click({ timeout: 1000, force: true }).catch(() => {});
        };
        await inert(panelTap);
        await inert(cardTap);
        seen.serviceCalls = (await stats()).serviceCalls;
        assert.equal(seen.serviceCalls, 0);
        await look(page);
        await capture(page, "a03-signed-out.png");
        // 7. Throughout.
        const perTab = [...sockets.values()];
        seen.peakOpenSocketsPerTab = perTab.map((tab) => tab.peak);
        assert(
          perTab.every((tab) => tab.created >= 1 && tab.peak === 1),
          "One fixture socket at a time in each tab",
        );
        seen.peakLiveRenderers = Math.max(...peakLive);
        assert(seen.peakLiveRenderers <= 1, "At most one live renderer");
        seen.requestsWithToken = urlsWithToken.length;
        assert.equal(seen.requestsWithToken, 0);
      } finally {
        await context.close();
        contexts.delete(context);
      }
    },
  );

  report.fixture = await stats();
  report.consoleSecrets = consoleSecrets;
  assert.equal(consoleSecrets, 0, "No secret may reach the console");
  assert.equal(report.externalRequests, 0, "No external request is allowed");
  assert.deepEqual(report.pageErrors, [], "Browser errors fail the check");
  assert.equal(report.fixture.serviceCalls, 0, "No service call is allowed");
  const failed = report.rows.filter((entry) => !entry.pass);
  assert.equal(failed.length, 0, `${failed.length} sign-in row(s) failed`);
  report.result = "passed";
} catch (error) {
  report.failedStage = stage;
  report.failure = redactSecrets(
    String(error.message)
      .replaceAll(root, "[source]")
      .replaceAll(temporary ?? "\0", "[temporary]"),
  ).slice(0, 1500);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  for (const context of contexts) await context.close().catch(() => undefined);
  await browser?.close();
  await server?.close();
  if (fixture) {
    fixture.child.kill("SIGTERM");
    await once(fixture.child, "exit").catch(() => undefined);
  }
  // Disposable browser profiles and the staged copy go away with it.
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
  if (bytes > 5 * 1024 * 1024) {
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
  const text = JSON.stringify(report, null, 2);
  // The report itself is checked last: it may never carry a token or code.
  if (SECRET.test(text)) {
    report.rows = [];
    report.result = "failed";
    report.failure = "Report contained a secret-like value; rows removed";
    process.exitCode = 1;
  }
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
}
