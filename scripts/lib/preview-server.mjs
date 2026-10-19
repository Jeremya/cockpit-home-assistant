import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".hbc": "application/octet-stream",
};

export async function previewServer(directory) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      let file = resolve(root, `.${path}`);
      if (!file.startsWith(root + sep) && file !== root) {
        response.writeHead(403).end();
        return;
      }
      if (file === root) file = resolve(root, "index.html");
      let data;
      try {
        data = await readFile(file);
      } catch (error) {
        if (!["ENOENT", "EISDIR"].includes(error.code)) throw error;
        if (!request.headers.accept?.includes("text/html")) {
          response.writeHead(404).end();
          return;
        }
        file = resolve(root, "index.html");
        data = await readFile(file);
      }
      response.writeHead(200, {
        "Content-Type": types[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(data);
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((accept, reject) => {
        server.close((error) => (error ? reject(error) : accept()));
        server.closeAllConnections();
      }),
  };
}
