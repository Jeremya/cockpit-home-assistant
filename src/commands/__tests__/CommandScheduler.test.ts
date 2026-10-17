import { CommandScheduler } from "../CommandScheduler";
import type {
  CommandTarget,
  ContinuousIntent,
  DispatchResult,
  QueuedCommand,
} from "../types";
import type { ServiceCallResult } from "../../session/types";

const target = (key = "fan-key"): CommandTarget =>
  Object.freeze({
    profileId: "ha:fixture",
    entityKey: key,
    entityId: `fan.${key}`,
    sessionId: "session",
  });
const noop = (): DispatchResult => ({ kind: "no-op", message: "Already set." });
let scheduler: CommandScheduler;
beforeEach(() => {
  jest.useFakeTimers();
  scheduler = new CommandScheduler();
});
afterEach(() => {
  scheduler.reset();
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
function queued(
  result: ReturnType<CommandScheduler["enqueue"]>,
): QueuedCommand {
  if (result.kind !== "queued") throw new Error("Expected queued");
  return result;
}
test("queue projection strips extra fields and snapshots mutable nested input", async () => {
  const intent = {
    kind: "setClimateTarget",
    target: { low: 19, high: 22, secret: "not retained" },
    code: "0017",
    ignored: "not retained",
  } as const;
  const send = jest.fn(noop);
  const value = queued(scheduler.enqueue(target(), intent, false, send));
  await jest.advanceTimersByTimeAsync(600);
  await expect(value.completion).resolves.toMatchObject({ kind: "no-op" });
  expect(send).toHaveBeenCalledWith(
    target(),
    { kind: "setClimateTarget", target: { low: 19, high: 22 } },
    false,
  );
  const projected = (
    send.mock.calls[0] as unknown as [CommandTarget, ContinuousIntent]
  )[1];
  expect(Object.isFrozen(projected)).toBe(true);
  expect(JSON.stringify(projected)).not.toMatch(/0017|secret|ignored/);
});
test("capacity refuses another lane without losing any of the existing pending completions", async () => {
  const send = jest.fn(noop);
  const values = Array.from({ length: 100 }, (_, i) =>
    queued(
      scheduler.enqueue(
        target(`key-${i}`),
        { kind: "setFanPercentage", percentage: 50 },
        false,
        send,
      ),
    ),
  );
  expect(
    scheduler.enqueue(
      target("overflow"),
      { kind: "setFanPercentage", percentage: 50 },
      false,
      send,
    ),
  ).toMatchObject({ kind: "refused", reason: "tracking_capacity" });
  scheduler.cancelAll("not_ready");
  for (const value of values)
    await expect(value.completion).resolves.toEqual({
      kind: "cancelled",
      reason: "not_ready",
    });
  await jest.advanceTimersByTimeAsync(1000);
  expect(send).not.toHaveBeenCalled();
});
test("immediate dispatch reserves its lane before running synchronous subscribers", () => {
  const nested = jest.fn(noop);
  expect(
    scheduler.execute("key", () => {
      expect(scheduler.execute("key", nested)).toMatchObject({
        kind: "refused",
        reason: "in_flight",
      });
      return noop();
    }).kind,
  ).toBe("no-op");
  expect(nested).not.toHaveBeenCalled();
  expect(scheduler.isInFlight("key")).toBe(false);
});
test("a dispatch exception resolves a queued decision safely and releases capacity", async () => {
  const value = queued(
    scheduler.enqueue(
      target(),
      { kind: "setFanPercentage", percentage: 50 },
      false,
      () => {
        throw new Error("private payload");
      },
    ),
  );
  await jest.advanceTimersByTimeAsync(600);
  await expect(value.completion).resolves.toMatchObject({
    kind: "refused",
    reason: "dispatch_failed",
  });
  expect(scheduler.execute("fan-key", noop).kind).toBe("no-op");
});
test("canceling unsent work retains the actual in-flight slot until a rejected promise settles", async () => {
  let reject!: (failure: unknown) => void;
  const result = new Promise<ServiceCallResult>((_, fail) => {
    reject = fail;
  });
  scheduler.execute("fan-key", () => ({
    kind: "started",
    target: target(),
    commandId: "test",
    result,
  }));
  const send = jest.fn(noop);
  const value = queued(
    scheduler.enqueue(
      target(),
      { kind: "setFanPercentage", percentage: 50 },
      false,
      send,
    ),
  );
  scheduler.cancelAll("background");
  await expect(value.completion).resolves.toEqual({
    kind: "cancelled",
    reason: "background",
  });
  expect(scheduler.isInFlight("fan-key")).toBe(true);
  reject(new Error("late failure"));
  await Promise.resolve();
  expect(scheduler.isInFlight("fan-key")).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
