import { spawn } from "node:child_process";
import { join } from "node:path";
import { nodeFetch } from "./nodeFetch";

/** The public auth fixture in its own Node process, on an ephemeral loopback port. */
export async function startFixture(args: string[] = []) {
  const child = spawn(
    process.execPath,
    [
      join(__dirname, "../../../../scripts/lib/web-auth-fixture.mjs"),
      "--serve",
      ...args,
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const origin = await new Promise<string>((resolve, reject) => {
    child.stdout!.once("data", (bytes) => {
      const ready = JSON.parse(String(bytes));
      if (ready.fixtureOnly === true) resolve(ready.origin);
      else reject(new Error("Unexpected fixture"));
    });
    child.once("exit", () => reject(new Error("Fixture exited")));
  });
  return {
    origin,
    stats: () =>
      nodeFetch(`${origin}/_fixture/status`).then((response) =>
        response.json(),
      ),
    stop: () => void child.kill("SIGTERM"),
  };
}

/** What HA's authorize page does: login flow with the forwarded challenge, then redirect. */
export async function authorizeAsHomeAssistant(
  authorizeUrl: string,
  username: string,
) {
  const authorize = new URL(authorizeUrl);
  const params = Object.fromEntries(authorize.searchParams);
  const flow = await nodeFetch(`${authorize.origin}/auth/login_flow`, {
    method: "POST",
    body: JSON.stringify({
      client_id: params.client_id,
      handler: ["homeassistant", null],
      redirect_uri: params.redirect_uri,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
    }),
  }).then((response) => response.json());
  const step = await nodeFetch(
    `${authorize.origin}/auth/login_flow/${flow.flow_id}`,
    {
      method: "POST",
      body: JSON.stringify({
        client_id: params.client_id,
        username,
        password: "public-fixture-password",
      }),
    },
  ).then((response) => response.json());
  const callback = new URL(params.redirect_uri!);
  callback.searchParams.set("code", step.result);
  callback.searchParams.set("state", params.state!);
  return callback.href;
}
