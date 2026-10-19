import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { WebSocket } from "ws";

for (const enabled of [false, true])
  test(
    `trial fixture ${enabled ? "explicitly simulates power" : "refuses power by default"}`,
    { timeout: 15_000 },
    async () => {
      const child = spawn(
        process.execPath,
        [
          "scripts/trial-ha-fixture.mjs",
          "0",
          ...(enabled ? ["--power-proof"] : []),
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let socket;
      try {
        const [bytes] = await once(child.stdout, "data");
        const { port, fixtureOnly, powerProof } = JSON.parse(String(bytes));
        assert.equal(fixtureOnly, true);
        assert.equal(powerProof, enabled);
        socket = new WebSocket(`ws://127.0.0.1:${port}/api/websocket`);
        const messages = [];
        socket.on("message", (raw) =>
          messages.push(JSON.parse(raw.toString())),
        );
        await once(socket, "open");
        let id = 0;
        async function request(payload) {
          const number = ++id;
          socket.send(JSON.stringify({ id: number, ...payload }));
          for (let attempt = 0; attempt < 100; attempt++) {
            const result = messages.find(
              (m) => m.id === number && m.type === "result",
            );
            if (result) return result;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          throw new Error("Fixture response missing");
        }
        socket.send(
          JSON.stringify({ type: "auth", access_token: "maurice-trial-proof" }),
        );
        const service = {
          type: "call_service",
          domain: "switch",
          service: "turn_on",
          target: { entity_id: "switch.trial_plug" },
          service_data: {},
        };
        await request({ type: "subscribe_entities" });
        assert.equal((await request(service)).success, enabled);
        assert.equal(
          (
            await request({
              ...service,
              target: { entity_id: "switch.household" },
            })
          ).success,
          false,
        );
        assert.equal(
          (await request({ ...service, service_data: { extra: true } }))
            .success,
          false,
        );
        if (enabled) {
          assert(
            messages.some(
              (m) => m.event?.c?.["switch.trial_plug"]?.["+"]?.s === "on",
            ),
          );
          await fetch(`http://127.0.0.1:${port}/_proof/config`, {
            method: "POST",
            body: JSON.stringify({ powerAccept: false }),
          });
          assert.equal(
            (await request({ ...service, service: "turn_off" })).success,
            false,
          );
        }
      } finally {
        socket?.terminate();
        child.kill("SIGTERM");
        if (child.exitCode === null) await once(child, "exit");
      }
    },
  );
