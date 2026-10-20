import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { localConnectionHandler } from "./lib/local-connection.mjs";

const { values } = parseArgs({
  options: {
    app: { type: "string", default: "http://localhost:8082" },
    port: { type: "string", default: "8083" },
    help: { type: "boolean", default: false },
    "local-ha": { type: "boolean", default: false },
    "ha-url": { type: "string", default: "http://127.0.0.1:8123" },
  },
});
if (values.help) {
  console.log(
    "Start Expo with npm run web -- --host localhost --port 8082\n" +
      "Then: node scripts/preview-devices.mjs [--app http://localhost:8082] [--port 8083]\n" +
      "Optional: --local-ha [--ha-url http://127.0.0.1:8123] enables loading .local/ha-token from Settings (helper on port 8083).",
  );
  process.exit(0);
}

const app = new URL(values.app);
const port = Number(values.port);
if (
  !["http:", "https:"].includes(app.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(app.hostname) ||
  app.username ||
  app.password ||
  app.pathname !== "/" ||
  app.search ||
  app.hash ||
  !Number.isSafeInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  Number(app.port || (app.protocol === "https:" ? 443 : 80)) === port
) {
  throw new Error(
    "Use a loopback app origin without credentials, path or query, and a separate preview port (1024–65535).",
  );
}

const assets = new Map();
const localConnection = values["local-ha"]
  ? localConnectionHandler({
      appOrigin: app.origin,
      host: `localhost:${port}`,
      haUrl: values["ha-url"],
      tokenFile: new URL("../.local/ha-token", import.meta.url),
    })
  : undefined;
for (const [route, file, type] of [
  ["/", "index.html", "text/html"],
  ["/preview.css", "preview.css", "text/css"],
  ["/preview.js", "preview.js", "text/javascript"],
]) {
  const content = await readFile(
    new URL(`./preview/${file}`, import.meta.url),
    "utf8",
  );
  assets.set(route, {
    type,
    content: content.replaceAll("__MAURICE_APP_ORIGIN__", app.origin),
  });
}
const server = createServer((request, response) => {
  if (localConnection && request.url === "/local-connection") {
    void localConnection(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(503);
      response.end();
    });
    return;
  }
  const asset = assets.get(request.url?.split("?")[0]);
  if (!asset || !["GET", "HEAD"].includes(request.method)) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": `${asset.type}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": `default-src 'none'; script-src 'self'; style-src 'self'; frame-src ${app.origin}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    "Referrer-Policy": "no-referrer",
  });
  response.end(request.method === "HEAD" ? undefined : asset.content);
});
server.on("error", (error) => {
  console.error(`Preview could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, "localhost", () => {
  console.log(`Maurice responsive preview: http://localhost:${port}`);
  console.log(`Shared app: ${app.origin} — start Expo separately.`);
  if (localConnection)
    console.log("Local token loading enabled for the configured app origin.");
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
  });
}
