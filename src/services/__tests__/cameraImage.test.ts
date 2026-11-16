import {
  cameraCacheKey,
  clearCameraCache,
  fetchCameraImage,
  originOf,
  readCameraCache,
  resolveCameraRedirect,
  sameOrigin,
  writeCameraCache,
  type CameraFetch,
  type CameraFetchResponse,
  type CameraImageResult,
} from "../cameraImage";

function response(
  status: number,
  options: {
    url?: string;
    headers?: Record<string, string>;
    body?: Uint8Array | string;
  } = {},
): CameraFetchResponse {
  const body =
    options.body instanceof Uint8Array
      ? options.body
      : new TextEncoder().encode(options.body ?? "");
  return {
    status,
    ok: status >= 200 && status < 300,
    url: options.url ?? "https://ha.example/api/camera_proxy/camera.door",
    headers: {
      get: (name: string) => options.headers?.[name.toLowerCase()] ?? null,
    },
    blob: async () =>
      new Blob([body.buffer as ArrayBuffer], {
        type: options.headers?.["content-type"] ?? "image/png",
      }),
  };
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("resolveCameraRedirect", () => {
  test("follows a same-origin absolute redirect", () => {
    expect(
      resolveCameraRedirect(
        "https://ha.example",
        "https://ha.example/api/camera_proxy/camera.door",
        "https://ha.example/image.png",
      ),
    ).toEqual({ kind: "follow", url: "https://ha.example/image.png" });
  });
  test("resolves a relative redirect against the request", () => {
    expect(
      resolveCameraRedirect(
        "https://ha.example",
        "https://ha.example/api/camera_proxy/camera.door",
        "/static/image.png",
      ),
    ).toEqual({ kind: "follow", url: "https://ha.example/static/image.png" });
  });
  test("refuses a cross-origin redirect", () => {
    expect(
      resolveCameraRedirect(
        "https://ha.example",
        "https://ha.example/api/camera_proxy/camera.door",
        "https://evil.example/image.png",
      ),
    ).toEqual({ kind: "refuse", reason: "cross_origin_redirect" });
  });
  test("refuses an HTTPS to HTTP downgrade", () => {
    expect(
      resolveCameraRedirect(
        "https://ha.example",
        "https://ha.example/api/camera_proxy/camera.door",
        "http://ha.example/image.png",
      ),
    ).toEqual({ kind: "refuse", reason: "https_downgrade" });
  });
  test("refuses a missing location", () => {
    expect(
      resolveCameraRedirect(
        "https://ha.example",
        "https://ha.example/api/camera_proxy/camera.door",
        null,
      ),
    ).toEqual({ kind: "refuse", reason: "cross_origin_redirect" });
  });
  test("same-origin differs only by protocol, port or host", () => {
    expect(sameOrigin("https://ha.example", "https://ha.example")).toBe(true);
    expect(sameOrigin("https://ha.example", "https://ha.example:8443")).toBe(
      false,
    );
    expect(sameOrigin("https://ha.example", "http://ha.example")).toBe(false);
    expect(originOf("https://ha.example:8123/path")).toBe(
      "https://ha.example:8123",
    );
  });
});

describe("fetchCameraImage", () => {
  test("returns a token-free data URI for an image response", async () => {
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, {
        headers: { "content-type": "image/png" },
        body: png,
      }),
    );
    const result = await fetchCameraImage(
      {
        uri: "https://ha.example/api/camera_proxy/camera.door",
        headers: { Authorization: "Bearer secret-token" },
      },
      { fetchImpl },
    );
    expect(result.kind).toBe("image");
    if (result.kind === "image") {
      expect(result.dataUri).toMatch(/^data:image\/png;base64,/);
      expect(result.dataUri).not.toContain("secret-token");
      expect(result.capturedAt).toBeNull();
      expect(result.fetchedAt).toBeTruthy();
    }
  });

  test("returns a data URI untouched for the offline demo path", async () => {
    const dataUri = "data:image/png;base64,AAAA";
    const fetchImpl: CameraFetch = jest.fn();
    const result = await fetchCameraImage(
      { uri: dataUri, headers: {} },
      { fetchImpl },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "image", dataUri });
  });

  test("refuses a cross-origin redirect before making a second request", async () => {
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(302, {
        url: "https://ha.example/api/camera_proxy/camera.door",
        headers: { location: "https://evil.example/image.png" },
      }),
    );
    const result = await fetchCameraImage(
      {
        uri: "https://ha.example/api/camera_proxy/camera.door",
        headers: { Authorization: "Bearer secret-token" },
      },
      { fetchImpl },
    );
    expect(result).toEqual({ kind: "error", reason: "cross_origin_redirect" });
    // Exactly one request: the redirect was refused before forwarding credentials.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("follows a same-origin redirect with the credential", async () => {
    const fetchImpl: CameraFetch = jest
      .fn()
      .mockResolvedValueOnce(
        response(302, {
          url: "https://ha.example/api/camera_proxy/camera.door",
          headers: { location: "/static/image.png" },
        }),
      )
      .mockResolvedValueOnce(
        response(200, {
          url: "https://ha.example/static/image.png",
          headers: { "content-type": "image/png" },
          body: png,
        }),
      );
    const result = await fetchCameraImage(
      {
        uri: "https://ha.example/api/camera_proxy/camera.door",
        headers: { Authorization: "Bearer secret-token" },
      },
      { fetchImpl },
    );
    expect(result.kind).toBe("image");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenLastCalledWith(
      "https://ha.example/static/image.png",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret-token" },
      }),
    );
  });

  test("refuses a non-image content type", async () => {
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { headers: { "content-type": "text/html" } }),
    );
    const result = await fetchCameraImage(
      {
        uri: "https://ha.example/api/camera_proxy/camera.door",
        headers: {},
      },
      { fetchImpl },
    );
    expect(result).toEqual({ kind: "error", reason: "not_an_image" });
  });

  test("reports empty as a distinct result", async () => {
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { headers: { "content-type": "image/png" }, body: "" }),
    );
    const result = await fetchCameraImage(
      {
        uri: "https://ha.example/api/camera_proxy/camera.door",
        headers: {},
      },
      { fetchImpl },
    );
    expect(result).toEqual({ kind: "empty" });
  });

  test("maps status codes to reasons", async () => {
    for (const [status, reason] of [
      [401, "unauthorized"],
      [403, "unauthorized"],
      [404, "not_found"],
      [500, "network"],
    ] as const) {
      const fetchImpl: CameraFetch = jest.fn(async () => response(status));
      const result = await fetchCameraImage(
        { uri: "https://ha.example/api/camera_proxy/camera.door", headers: {} },
        { fetchImpl },
      );
      expect(result).toEqual({ kind: "error", reason });
    }
  });

  test("refuses an opaque redirect (status 0)", async () => {
    const fetchImpl: CameraFetch = jest.fn(async () => response(0));
    const result = await fetchCameraImage(
      { uri: "https://ha.example/api/camera_proxy/camera.door", headers: {} },
      { fetchImpl },
    );
    expect(result).toEqual({ kind: "error", reason: "cross_origin_redirect" });
  });

  test("bounces after too many redirects", async () => {
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(302, { headers: { location: "/again" } }),
    );
    const result = await fetchCameraImage(
      { uri: "https://ha.example/api/camera_proxy/camera.door", headers: {} },
      { fetchImpl },
    );
    expect(result).toEqual({ kind: "error", reason: "cross_origin_redirect" });
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 redirect hops
  });
});

describe("camera cache", () => {
  const image: CameraImageResult = {
    kind: "image",
    dataUri: "data:image/png;base64,AAAA",
    contentType: "image/png",
    fetchedAt: "now",
    capturedAt: null,
  };
  test("is scoped by profile and cleared per profile", () => {
    const key = cameraCacheKey("ha:a", "entity:door");
    writeCameraCache(key, image);
    expect(readCameraCache(key)).toEqual(image);
    expect(
      readCameraCache(cameraCacheKey("ha:b", "entity:door")),
    ).toBeUndefined();
    clearCameraCache("ha:a");
    expect(readCameraCache(key)).toBeUndefined();
  });
  test("stays bounded", () => {
    for (let i = 0; i < 30; i++)
      writeCameraCache(cameraCacheKey("ha:a", `entity:${i}`), image);
    expect(readCameraCache(cameraCacheKey("ha:a", "entity:0"))).toBeUndefined();
    expect(readCameraCache(cameraCacheKey("ha:a", "entity:29"))).toEqual(image);
  });
});
