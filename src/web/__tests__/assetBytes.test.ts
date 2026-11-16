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
