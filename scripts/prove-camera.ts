import assert from "node:assert/strict";
import http from "node:http";
import {
  fetchCameraImage,
  type CameraFetch,
  type CameraImageResult,
} from "../src/services/cameraImage";
import {
  CAMERA_FIXTURE_TOKEN,
  CAMERA_SCENARIOS,
  FIXTURE_PNG,
  startCameraFixture,
} from "./camera-fixture.mjs";

/**
 * Loopback proof for the camera image transport (I01), driven through the
 * public camera fixture (`scripts/camera-fixture.mjs`). The fixture's two
 * origins record what they received themselves: origin B must receive no
 * request — and therefore no credential — on a cross-origin redirect.
 *
 * Every scenario the Android recipe uses runs here through the real
 * `fetchCameraImage`, twice where the transport matters: through a minimal
 * transport that only offers a Blob and cannot follow a redirect, and through
 * the platform `fetch` of this Node process, which reads
 * `response.arrayBuffer()` as the app does and would follow a redirect if
 * `redirect: "manual"` were not honoured. The two scenarios that only end on
 * the 15 s budget are ended here by a caller abort, to keep the proof short;
 * the deadline itself is covered with fake timers in Jest, and the native
 * recipe observes it in real time. No configured HA or physical device is
 * contacted. This is Node evidence only; it says nothing about Android.
 */

const FIXTURE_DATA_URI = `data:image/png;base64,${FIXTURE_PNG.toString("base64")}`;
const headers = { Authorization: `Bearer ${CAMERA_FIXTURE_TOKEN}` };

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Honors `redirect: "manual"`: returns the 3xx response, never follows it. */
const blobOnlyFetch: CameraFetch = (url, init) =>
  new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = http.request(
      {
        host: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: init.headers,
        signal: init.signal,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("aborted")));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          const status = response.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            url,
            headers: {
              get: (name: string) => {
                const value = response.headers[name.toLowerCase()];
                return typeof value === "string" ? value : null;
              },
            },
            blob: async () => new Blob([new Uint8Array(body)]),
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });

function outcome(result: CameraImageResult): string {
  return result.kind === "error" ? `error:${result.reason}` : result.kind;
}

async function main() {
  const fixture = await startCameraFixture({ ha: false });
  const uriFor = (id: string) =>
    `${fixture.originA}/api/camera_proxy/${fixture.entityIdFor({ id })}`;
  const transports: { name: string; fetchImpl?: CameraFetch }[] = [
    { name: "Blob-only transport", fetchImpl: blobOnlyFetch },
    { name: "platform fetch" },
  ];

  try {
    for (const transport of transports) {
      for (const scenario of CAMERA_SCENARIOS) {
        // The Blob-only transport buffers in `end`, so a cut body rejects
        // before the headers are seen; its own result is still `network`.
        const timed = scenario.contract === "error:timeout";
        fixture.reset();
        const caller = new AbortController();
        const pending = fetchCameraImage(
          { uri: uriFor(scenario.id), headers },
          { fetchImpl: transport.fetchImpl, signal: caller.signal },
        );
        let result: CameraImageResult;
        if (timed) {
          // Ended by the caller instead of the 15 s budget (see above).
          await delay(300);
          caller.abort();
          result = await pending;
          assert.equal(
            outcome(result),
            "error:network",
            `${transport.name} / ${scenario.id}`,
          );
          // The transport really closed the connection, not left it to linger.
          let closed = false;
          for (let i = 0; i < 50 && !closed; i++) {
            closed = fixture
              .requests()
              .every((r) => r.origin !== "A" || r.closedAfterMs !== null);
            if (!closed) await delay(100);
          }
          assert.equal(
            closed,
            true,
            `${transport.name} / ${scenario.id} closed`,
          );
        } else {
          result = await pending;
          assert.equal(
            outcome(result),
            scenario.contract,
            `${transport.name} / ${scenario.id}`,
          );
        }

        const requests = fixture.requests();
        // The credential is never echoed into the result.
        assert(!JSON.stringify(result).includes(CAMERA_FIXTURE_TOKEN));
        // Origin B is never contacted, whatever the scenario.
        assert.equal(
          requests.filter((r) => r.origin === "B").length,
          0,
          `${transport.name} / ${scenario.id}: origin B contacted`,
        );
        // Every request origin A received carried the credential.
        assert(requests.every((r) => r.credential));

        if (scenario.id === "image" || scenario.id === "same_redirect")
          assert.equal(
            result.kind === "image" && result.dataUri,
            FIXTURE_DATA_URI,
          );
        if (scenario.id === "same_redirect")
          assert.deepEqual(
            requests.map((r) => r.path),
            [
              "/api/camera_proxy/camera.fixture_same_redirect",
              "/frames/same-origin.png",
            ],
          );
        if (scenario.id === "cross_redirect")
          assert.deepEqual(
            requests.map((r) => r.path),
            ["/api/camera_proxy/camera.fixture_cross_redirect"],
          );
      }
    }

    console.log(
      `PASS: camera transport, ${CAMERA_SCENARIOS.length} fixture scenarios through a Blob-only transport and through this process's platform fetch reading response.arrayBuffer(). Same-origin images and same-origin redirects are retrieved byte-exact with the bearer; a cross-origin redirect is refused before the second origin receives any request (and therefore no credential); non-image, undecodable, cut, unauthorized, stalled and unanswered retrievals end as their contracted results, and an abort closes the connection. Loopback and Node only; no physical device or configured HA was contacted.`,
    );
  } finally {
    await fixture.close();
  }
}

main().catch((error) => {
  console.error("Camera image proof failed. No credentials are printed.");
  if (process.env.CAMERA_PROOF_DEBUG)
    console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
