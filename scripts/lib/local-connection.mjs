import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { Buffer } from "node:buffer";

const MAX_TOKEN_BYTES = 16_384;

/** Opt-in development endpoint. No client-provided path or HA destination. */
export function localConnectionHandler({ appOrigin, host, haUrl, tokenFile }) {
  const url = new URL(haUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("The local HA address must be an HTTP(S) origin.");
  }
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Vary", "Origin");
    // Host rejects DNS rebinding. Origin and the non-simple header reject web
    // cross-origin reads AND simple form submissions before touching the file.
    if (request.headers.host !== host || request.headers.origin !== appOrigin) {
      response.writeHead(403).end("Local connection access denied.");
      return;
    }
    response.setHeader("Access-Control-Allow-Origin", appOrigin);
    if (request.method === "OPTIONS") {
      const headers = request.headers["access-control-request-headers"]
        ?.toLowerCase()
        .split(",")
        .map((value) => value.trim());
      if (
        request.headers["access-control-request-method"] !== "POST" ||
        headers?.length !== 1 ||
        headers[0] !== "x-maurice-local-connection"
      ) {
        response.writeHead(403).end("Local connection access denied.");
        return;
      }
      response.setHeader("Access-Control-Allow-Methods", "POST");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "X-Maurice-Local-Connection",
      );
      response.writeHead(204).end();
      return;
    }
    if (
      request.method !== "POST" ||
      request.headers["x-maurice-local-connection"] !== "1" ||
      request.headers["transfer-encoding"] ||
      Number(request.headers["content-length"] ?? 0) !== 0
    ) {
      response.writeHead(403).end("Local connection access denied.");
      return;
    }
    let file;
    try {
      file = await open(
        tokenFile,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const stat = await file.stat();
      if (!stat.isFile() || stat.mode & 0o077 || stat.size > MAX_TOKEN_BYTES) {
        throw new Error("Invalid token file");
      }
      const buffer = Buffer.alloc(MAX_TOKEN_BYTES + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      const token = buffer.toString("utf8", 0, bytesRead).trim();
      if (
        !token ||
        bytesRead > MAX_TOKEN_BYTES ||
        !/^[\x21-\x7e]+$/.test(token)
      ) {
        throw new Error("Invalid token file");
      }
      response
        .writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ url: url.origin, token }));
    } catch {
      // Never serialize filesystem errors, paths or file contents.
      response.writeHead(503).end("Local connection unavailable.");
    } finally {
      await file?.close();
    }
  };
}
