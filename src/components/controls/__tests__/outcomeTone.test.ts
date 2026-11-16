import type { CommandRecord, CommandStatus } from "../../../commands/types";
import { outcomeTone } from "../outcomeTone";

const record = (
  status: CommandStatus,
  confirmation?: CommandRecord["confirmation"],
) => ({ status, confirmation }) as CommandRecord;

test("only a state observed after the request, and not assumed, looks observed", () => {
  expect(
    outcomeTone(record("confirmed", { kind: "observed", assumed: false })).tone,
  ).toBe("observed");
});

test.each([
  ["a report the integration assumed", { kind: "observed", assumed: true }],
  ["a state reconciled later", { kind: "reconciled", assumed: false }],
  ["a confirmation without its evidence", undefined],
] as const)("%s stays neutral", (_, confirmation) => {
  expect(outcomeTone(record("confirmed", confirmation)).tone).toBe("neutral");
});

test.each([
  ["sending", "neutral"],
  ["accepted", "neutral"],
  ["unconfirmed", "warning"],
  ["failed", "danger"],
] as const)(
  "%s never borrows the observed tone or its check mark",
  (status, tone) => {
    const look = outcomeTone(record(status));
    expect(look.tone).toBe(tone);
    expect(look.icon).not.toBe("check-circle");
  },
);
