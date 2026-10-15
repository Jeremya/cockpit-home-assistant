import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { HomeSnapshot, SessionError } from "../src/core/types";
import {
  HomeAssistantBackend,
  withDeadline,
} from "../src/session/homeAssistant/HomeAssistantBackend";

async function main() {
  const token = await readFile(
    process.env.HA_TOKEN_FILE ?? ".local/ha-token",
    "utf8",
  )
    .then((value) => value.trim())
    .catch(() => "");
  if (!token) {
    console.error(
      "Create a HA long-lived token and save it in .local/ha-token, or set HA_TOKEN_FILE to its local file. The token is never printed.",
    );
    process.exitCode = 1;
    return;
  }
  const backend = new HomeAssistantBackend(
    {
      url: process.env.HA_URL ?? "http://127.0.0.1:8123",
      token,
      allowInsecureHttp: process.env.HA_ALLOW_INSECURE_HTTP === "1",
    },
    "live-ha-proof",
  );
  let snapshot: HomeSnapshot | undefined;
  let lastError: SessionError | undefined;
  backend.onSnapshot((value) => {
    snapshot = value;
  });
  backend.onStatus((status) => {
    if (status.kind === "error") lastError = status.error;
  });
  const started = Date.now();
  try {
    await withDeadline(backend.start(), 30_000, new Error("proof_timeout"));
    assert(snapshot, "No snapshot emitted");
    assert.equal(backend.status.kind, "ready");
    const initialMs = Date.now() - started;
    const initialEpoch = snapshot.syncEpoch;
    assert.equal(await backend.ping(5_000), true);
    const refresh = backend.resync();
    assert.equal(backend.resync(), refresh);
    await withDeadline(refresh, 20_000, new Error("proof_timeout"));
    assert(snapshot.syncEpoch > initialEpoch);
    const refreshEpoch = snapshot.syncEpoch;
    await backend.setForeground(false);
    await withDeadline(
      backend.setForeground(true),
      25_000,
      new Error("proof_timeout"),
    );
    assert(snapshot.syncEpoch > refreshEpoch);
    const foregroundEpoch = snapshot.syncEpoch;
    let unsubscribe = () => {};
    const recovered = new Promise<void>((resolve, reject) => {
      unsubscribe = backend.onStatus((status) => {
        if (status.kind === "ready") resolve();
        else if (status.kind === "error") reject(new Error("recovery_failed"));
      });
    });
    try {
      backend.recover();
      await withDeadline(recovered, 30_000, new Error("proof_timeout"));
    } finally {
      unsubscribe();
    }
    assert.equal(backend.status.kind, "ready");
    assert(snapshot.syncEpoch > foregroundEpoch);
    const entitiesByDomain: Record<string, number> = {};
    for (const entity of Object.values(snapshot.entities))
      entitiesByDomain[entity.domain] =
        (entitiesByDomain[entity.domain] ?? 0) + 1;
    // Deliberately exclude credentials, URLs, entity ids, names, states and attributes.
    console.log(
      JSON.stringify(
        {
          result: "passed",
          haVersion: snapshot.config.haVersion,
          temperatureUnit: snapshot.config.temperatureUnit,
          initialMs,
          entitiesByDomain,
          metadata: Object.fromEntries(
            Object.entries(snapshot.metadata).map(([key, value]) => [
              key,
              value.kind,
            ]),
          ),
          checks: [
            "authentication",
            "initial_snapshot",
            "ping",
            "fresh_resync",
            "coalescing",
            "foreground_resync",
            "forced_reconnect",
          ],
          serviceCalls: 0,
        },
        null,
        2,
      ),
    );
  } catch {
    console.error(
      `Live HA proof failed${lastError ? ` (${lastError.code})` : ""}. No credentials or household data are printed.`,
    );
    process.exitCode = 1;
  } finally {
    backend.stop();
  }
}
main().catch(() => {
  console.error(
    "Live HA proof could not start. Check HA_URL, HTTP consent and the local token file. No credentials are printed.",
  );
  process.exitCode = 1;
});
