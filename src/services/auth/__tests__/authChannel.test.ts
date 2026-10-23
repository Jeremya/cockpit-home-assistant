import { createAuthChannel, AUTH_CHANNEL } from "../authChannel";

/** Same delivery rule as BroadcastChannel: every other instance of the name. */
class FakeChannel {
  static open: FakeChannel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.push(this);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.open)
      if (other !== this && other.name === this.name)
        other.onmessage?.({ data: structuredClone(data) });
  }
}
beforeEach(() => {
  FakeChannel.open = [];
});
const Channel = FakeChannel as unknown as typeof BroadcastChannel;

test("a sign-out reaches other tabs with the profile only", () => {
  const first = createAuthChannel(Channel);
  const second = createAuthChannel(Channel);
  const received = jest.fn();
  const own = jest.fn();
  second.subscribe(received);
  first.subscribe(own);
  first.post({ type: "signed-out", profileId: "ha:https://home.example.com" });
  expect(received).toHaveBeenCalledWith({
    type: "signed-out",
    profileId: "ha:https://home.example.com",
  });
  expect(own).not.toHaveBeenCalled();
  expect(FakeChannel.open.map((channel) => channel.name)).toEqual([
    AUTH_CHANNEL,
    AUTH_CHANNEL,
  ]);
});

test.each([
  "signed-out",
  { type: "signed-out" },
  { type: "signed-out", profileId: "demo" },
  { type: "signed-out", profileId: "ha:https://a.example", token: "x" },
  { type: "granted", profileId: "ha:https://a.example" },
  { type: "principal-changed", profileId: "ha:https://a.example" },
  {
    type: "principal-changed",
    profileId: "ha:https://a.example",
    principal: "user-alice",
  },
])("a malformed message %j is ignored", (data) => {
  createAuthChannel(Channel);
  const listener = jest.fn();
  createAuthChannel(Channel).subscribe(listener);
  FakeChannel.open[0]!.postMessage(data);
  expect(listener).not.toHaveBeenCalled();
});

test("without BroadcastChannel, posting and listening do nothing", () => {
  const channel = createAuthChannel(undefined);
  const unsubscribe = channel.subscribe(jest.fn());
  expect(() =>
    channel.post({
      type: "principal-changed",
      profileId: "ha:https://a.example",
      principal: "P".repeat(43),
    }),
  ).not.toThrow();
  unsubscribe();
});

test("a principal change carries the non-secret principal only", () => {
  const listener = jest.fn();
  createAuthChannel(Channel).subscribe(listener);
  const message = {
    type: "principal-changed" as const,
    profileId: "ha:https://a.example",
    principal: "P".repeat(43),
  };
  createAuthChannel(Channel).post(message);
  expect(listener).toHaveBeenCalledWith(message);
});
