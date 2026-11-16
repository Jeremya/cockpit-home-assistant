import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  fetchCameraImage,
  type CameraFetch,
} from "../src/services/cameraImage";

/**
 * Loopback proof for the camera image transport (I01). Two local origins are
 * driven through the real `fetchCameraImage` with a fake bearer. The second
 * origin must receive no request — and therefore no credential — on a
 * cross-origin redirect. No configured HA or physical device is contacted.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BEARER = "camera-proof-token";

interface Seen {
  path: string;
  authorization: string | null;
}

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/** Honors `redirect: "manual"`: returns the 3xx response, never follows it. */
function nodeFetch(seen: Seen[]): CameraFetch {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const request = http.request(
        {
          host: parsed.hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers: init.headers,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("end", () => {
            const body = Buffer.concat(chunks);
            seen.push({
              path: parsed.pathname,
              authorization:
                init.headers.Authorization ??
                init.headers.authorization ??
                null,
            });
            resolve({
              status: response.statusCode ?? 0,
              ok:
                (response.statusCode ?? 0) >= 200 &&
                (response.statusCode ?? 0) < 300,
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
}

async function main() {
  const seenB: Seen[] = [];
  const originB = await startServer((_req, res) => {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG);
  });

  const seenA: Seen[] = [];
  const originA = await startServer((req, res) => {
    if (req.url === "/same-origin") {
      res.writeHead(302, { location: "/image.png" });
      res.end();
    } else if (req.url === "/api/camera_proxy/camera.door") {
      res.writeHead(302, {
        location: `http://127.0.0.1:${originB.port}/image.png`,
      });
      res.end();
    } else if (req.url === "/image.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG);
    } else if (req.url === "/not-image") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html></html>");
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  try {
    const headers = { Authorization: `Bearer ${BEARER}` };

    // Direct same-origin image: succeeds, credential attached, token not echoed.
    const direct = await fetchCameraImage(
      { uri: `http://127.0.0.1:${originA.port}/image.png`, headers },
      { fetchImpl: nodeFetch(seenA) },
    );
    assert.equal(direct.kind, "image");
    assert(direct.kind === "image" && !direct.dataUri.includes(BEARER));
    assert.equal(seenA.at(-1)?.authorization, `Bearer ${BEARER}`);

    // Same-origin redirect: followed with the credential.
    const same = await fetchCameraImage(
      { uri: `http://127.0.0.1:${originA.port}/same-origin`, headers },
      { fetchImpl: nodeFetch(seenA) },
    );
    assert.equal(same.kind, "image");
    assert(seenA.some((s) => s.path === "/same-origin"));
    assert(
      seenA
        .filter((s) => s.path === "/image.png")
        .every((s) => s.authorization === `Bearer ${BEARER}`),
    );

    // Cross-origin redirect: refused before the second origin sees a request.
    const cross = await fetchCameraImage(
      {
        uri: `http://127.0.0.1:${originA.port}/api/camera_proxy/camera.door`,
        headers,
      },
      { fetchImpl: nodeFetch(seenA) },
    );
    assert.deepEqual(cross, { kind: "error", reason: "cross_origin_redirect" });
    assert.equal(seenB.length, 0);

    // Non-image content type is refused.
    const notImage = await fetchCameraImage(
      { uri: `http://127.0.0.1:${originA.port}/not-image`, headers },
      { fetchImpl: nodeFetch(seenA) },
    );
    assert.deepEqual(notImage, { kind: "error", reason: "not_an_image" });

    console.log(
      "PASS: camera transport retrieves same-origin images, follows same-origin redirects with the bearer, and refuses a cross-origin redirect before the second origin receives any request (and therefore no credential). Loopback only; no physical device or configured HA was contacted.",
    );
  } finally {
    await originA.close();
    await originB.close();
  }
}

main().catch((error) => {
  console.error("Camera image proof failed. No credentials are printed.");
  if (process.env.CAMERA_PROOF_DEBUG)
    console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
