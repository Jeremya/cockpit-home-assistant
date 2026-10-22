import { request } from "node:http";

/**
 * jest-expo replaces global fetch with Expo's native-module polyfill. This test
 * utility performs real loopback HTTP for the public fixture; FormData bodies
 * (the official client's refresh) are sent urlencoded, which HA also accepts.
 */
export const nodeFetch = ((input: string, init: RequestInit = {}) =>
  new Promise<Response>((resolve, reject) => {
    const body =
      init.body instanceof FormData
        ? new URLSearchParams(
            [...init.body.entries()].map(([key, value]) => [
              key,
              String(value),
            ]),
          )
        : init.body;
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
    };
    if (body instanceof URLSearchParams)
      headers["content-type"] = "application/x-www-form-urlencoded";
    const outgoing = request(
      input,
      {
        method: init.method ?? "GET",
        headers,
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode,
              headers: incoming.headers as Record<string, string>,
            }),
          ),
        );
        incoming.on("error", reject);
      },
    );
    outgoing.on("error", reject);
    outgoing.end(
      body === undefined || body === null ? undefined : String(body),
    );
  })) as typeof fetch;
