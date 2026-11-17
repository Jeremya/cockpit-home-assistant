import { readAssetBytes } from "../assetBytes";

/** Minimal XMLHttpRequest double: records the request, answers on send. */
function fakeXhr(answer: {
  status?: number;
  response?: ArrayBuffer | null;
  fail?: boolean;
}) {
  const opened: string[] = [];
  class Fake {
    status = 0;
    response: ArrayBuffer | null = null;
    responseType = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    open(method: string, url: string) {
      opened.push(`${method} ${url}`);
    }
    send() {
      if (answer.fail) return this.onerror?.();
      this.status = answer.status ?? 200;
      this.response = answer.response ?? null;
      this.onload?.();
    }
  }
  return { Xhr: Fake as unknown as typeof XMLHttpRequest, opened };
}

test("reads an embedded asset as bytes without fetch", async () => {
  const bytes = new ArrayBuffer(8);
  const { Xhr, opened } = fakeXhr({ response: bytes });
  await expect(
    readAssetBytes("file:///android_asset/www.bundle/a.glb", Xhr),
  ).resolves.toBe(bytes);
  expect(opened).toEqual(["GET file:///android_asset/www.bundle/a.glb"]);
});

test("accepts the zero status some file:// readers report with a body", async () => {
  const bytes = new ArrayBuffer(4);
  const { Xhr } = fakeXhr({ status: 0, response: bytes });
  await expect(readAssetBytes("file:///x.glb", Xhr)).resolves.toBe(bytes);
});

test("fails closed on HTTP errors, empty bodies and transport errors", async () => {
  await expect(
    readAssetBytes(
      "/x.glb",
      fakeXhr({ status: 404, response: new ArrayBuffer(2) }).Xhr,
    ),
  ).rejects.toThrow("Asset unavailable");
  await expect(
    readAssetBytes("/x.glb", fakeXhr({ status: 200, response: null }).Xhr),
  ).rejects.toThrow("Asset unavailable");
  await expect(
    readAssetBytes("/x.glb", fakeXhr({ fail: true }).Xhr),
  ).rejects.toThrow("Asset unavailable");
});

/** An XMLHttpRequest whose transport never finishes until the test answers. */
function stalledXhr() {
  const requests: {
    abort: jest.Mock;
    answer: (status: number, body: ArrayBuffer) => void;
  }[] = [];
  class Stalled {
    status = 0;
    response: ArrayBuffer | null = null;
    responseType = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    abort = jest.fn(() => this.onabort?.());
    open() {}
    send() {
      requests.push({
        abort: this.abort,
        answer: (status, body) => {
          this.status = status;
          this.response = body;
          this.onload?.();
        },
      });
    }
  }
  return { Xhr: Stalled as unknown as typeof XMLHttpRequest, requests };
}

describe("a read that never finishes", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("settles as unavailable at the bound and aborts the transport", async () => {
    const { Xhr, requests } = stalledXhr();
    let outcome = "pending";
    readAssetBytes("/stalled.glb", Xhr, 1_000).then(
      () => (outcome = "loaded"),
      (error: Error) => (outcome = error.message),
    );
    await jest.advanceTimersByTimeAsync(999);
    expect(outcome).toBe("pending");
    await jest.advanceTimersByTimeAsync(1);
    expect(outcome).toBe("Asset unavailable");
    expect(requests[0]!.abort).toHaveBeenCalledTimes(1);
  });

  test("ignores an answer that arrives after the bound", async () => {
    const { Xhr, requests } = stalledXhr();
    const read = readAssetBytes("/late.glb", Xhr, 1_000);
    const rejected = expect(read).rejects.toThrow("Asset unavailable");
    await jest.advanceTimersByTimeAsync(1_000);
    requests[0]!.answer(200, new ArrayBuffer(8));
    await rejected;
  });

  test("an answer inside the bound clears its timer", async () => {
    const { Xhr, requests } = stalledXhr();
    const bytes = new ArrayBuffer(8);
    const read = readAssetBytes("/slow.glb", Xhr, 1_000);
    await jest.advanceTimersByTimeAsync(900);
    requests[0]!.answer(200, bytes);
    await expect(read).resolves.toBe(bytes);
    expect(jest.getTimerCount()).toBe(0);
    expect(requests[0]!.abort).not.toHaveBeenCalled();
  });
});
