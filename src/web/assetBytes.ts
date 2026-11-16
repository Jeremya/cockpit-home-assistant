/**
 * Reads a bundled asset as bytes. The Android APK serves the DOM bundle from
 * file:///android_asset/, where the WebView refuses fetch() ("Failed to fetch")
 * but XMLHttpRequest reads the same file; the web build serves it over HTTP,
 * where both work. One transport keeps both platforms on the same path.
 */
export function readAssetBytes(
  url: string,
  Xhr: typeof XMLHttpRequest = XMLHttpRequest,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const request = new Xhr();
    const fail = () => reject(new Error("Asset unavailable"));
    request.open("GET", url);
    request.responseType = "arraybuffer";
    request.onload = () => {
      const body = request.response as ArrayBuffer | null;
      // file:// readers may report status 0 together with the file's body.
      const ok =
        request.status === 0 || (request.status >= 200 && request.status < 300);
      if (ok && body && body.byteLength > 0) resolve(body);
      else fail();
    };
    request.onerror = fail;
    request.send();
  });
}
