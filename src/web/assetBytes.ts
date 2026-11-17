/**
 * A bundled furniture asset is a few hundred kilobytes read from the app's own
 * bundle; past this bound the read is treated as failed so its fallback stays
 * and a later scene build may ask again.
 */
export const ASSET_READ_TIMEOUT_MS = 15_000;

/**
 * Reads a bundled asset as bytes. The Android APK serves the DOM bundle from
 * file:///android_asset/, where the WebView refuses fetch() ("Failed to fetch")
 * but XMLHttpRequest reads the same file; the web build serves it over HTTP,
 * where both work. One transport keeps both platforms on the same path.
 *
 * The read settles exactly once: with the body, or as unavailable on an error,
 * an abort or the bound. A transport that never finishes is aborted at the
 * bound, and an answer arriving afterwards is ignored.
 */
export function readAssetBytes(
  url: string,
  Xhr: typeof XMLHttpRequest = XMLHttpRequest,
  timeoutMs = ASSET_READ_TIMEOUT_MS,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new Xhr();
    let settled = false;
    const finish = (body?: ArrayBuffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (body) resolve(body);
      else reject(new Error("Asset unavailable"));
    };
    const timer = setTimeout(() => {
      finish();
      request.abort();
    }, timeoutMs);
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.onload = () => {
      const body = request.response as ArrayBuffer | null;
      // file:// readers may report status 0 together with the file's body.
      const ok =
        request.status === 0 || (request.status >= 200 && request.status < 300);
      finish(ok && body && body.byteLength > 0 ? body : undefined);
    };
    request.onerror = () => finish();
    request.onabort = () => finish();
    request.send();
  });
}
