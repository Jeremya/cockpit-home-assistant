import {
  cameraCacheKey,
  clearCameraCache,
  evictCameraCache,
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

/**
 * A response as every platform fetch gives it: the body is read through
 * `arrayBuffer()`. Passing `blob` instead models a transport that only offers a
 * Blob, so the response then has no `arrayBuffer()` at all.
 */
function response(
  status: number,
  options: {
    url?: string;
    headers?: Record<string, string>;
    body?: Uint8Array | string;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    blob?: () => Promise<Blob>;
  } = {},
): CameraFetchResponse {
  const body =
    options.body instanceof Uint8Array
      ? options.body
      : new TextEncoder().encode(options.body ?? "");
  const head = {
    status,
    ok: status >= 200 && status < 300,
    url: options.url ?? "https://ha.example/api/camera_proxy/camera.door",
    headers: {
      get: (name: string) => options.headers?.[name.toLowerCase()] ?? null,
    },
  };
  if (options.blob) return { ...head, blob: options.blob };
  return {
    ...head,
    arrayBuffer: options.arrayBuffer ?? (async () => bufferOf(body)),
  };
}
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** The eight PNG signature bytes above, as the data URI they must become. */
const pngDataUri = "data:image/png;base64,iVBORw0KGgo=";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const request = {
  uri: "https://ha.example/api/camera_proxy/camera.door",
  headers: { Authorization: "Bearer secret-token" },
};
const imageHeaders = { "content-type": "image/png" };
/** A body the server never finishes sending, on either read path. */
const stalled = <T>() => new Promise<T>(() => {});
/** Records how a retrieval settles; `fetchCameraImage` must never reject. */
function settlement(retrieval: Promise<CameraImageResult>) {
  const settled = jest.fn<void, [CameraImageResult]>();
  void retrieval.then(settled);
  return settled;
}

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
  test("refuses an unparseable location instead of throwing", () => {
    expect(
      resolveCameraRedirect(
        "https://ha.example",
        "https://ha.example/api/camera_proxy/camera.door",
        "http://[",
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

describe("fetchCameraImage body read", () => {
  const retrieve = (served: CameraFetchResponse) =>
    fetchCameraImage(request, { fetchImpl: jest.fn(async () => served) });
  const blobOf = (bytes: Uint8Array) => async () =>
    new Blob([bufferOf(bytes)], { type: "image/png" });

  test("reads the bytes through arrayBuffer, with no Blob involved", async () => {
    const served = response(200, { headers: imageHeaders, body: png });
    expect(served.blob).toBeUndefined();
    await expect(retrieve(served)).resolves.toMatchObject({
      kind: "image",
      dataUri: pngDataUri,
      contentType: "image/png",
    });
  });

  test("prefers arrayBuffer when the response also offers a Blob", async () => {
    const blob = jest.fn(blobOf(new Uint8Array([1, 2, 3])));
    const served = {
      ...response(200, { headers: imageHeaders, body: png }),
      blob,
    };
    await expect(retrieve(served)).resolves.toMatchObject({
      kind: "image",
      dataUri: pngDataUri,
    });
    expect(blob).not.toHaveBeenCalled();
  });

  test("falls back to the Blob when the response offers nothing else", async () => {
    const served = response(200, { headers: imageHeaders, blob: blobOf(png) });
    expect(served.arrayBuffer).toBeUndefined();
    await expect(retrieve(served)).resolves.toMatchObject({
      kind: "image",
      dataUri: pngDataUri,
      contentType: "image/png",
    });
  });

  test("reports a response with no way to read its body as a network error", async () => {
    const { status, ok, url, headers } = response(200, {
      headers: imageHeaders,
      body: png,
    });
    const unreadable: CameraFetchResponse = { status, ok, url, headers };
    await expect(retrieve(unreadable)).resolves.toEqual({
      kind: "error",
      reason: "network",
    });
  });

  test.each<[string, (bytes: Uint8Array) => CameraFetchResponse]>([
    [
      "arrayBuffer",
      (bytes) =>
        response(200, {
          headers: imageHeaders,
          arrayBuffer: async () => bufferOf(bytes),
        }),
    ],
    [
      "Blob",
      (bytes) => response(200, { headers: imageHeaders, blob: blobOf(bytes) }),
    ],
  ])("bounds the bytes actually read through %s", async (_path, serve) => {
    await expect(
      retrieve(serve(new Uint8Array(MAX_IMAGE_BYTES + 1))),
    ).resolves.toEqual({ kind: "error", reason: "too_large" });
    await expect(
      retrieve(serve(new Uint8Array(MAX_IMAGE_BYTES))),
    ).resolves.toMatchObject({ kind: "image" });
    await expect(retrieve(serve(new Uint8Array(0)))).resolves.toEqual({
      kind: "empty",
    });
  });

  test("encodes the same data URI without Buffer, the branch a phone or browser runtime takes", async () => {
    // Every byte value, a length that is not a multiple of three, and more
    // than one encoding chunk.
    const bytes = Uint8Array.from(
      { length: 0x8000 * 2 + 5 },
      (_, index) => (index * 31) % 256,
    );
    const expected = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
    const runtime = globalThis as { Buffer?: typeof Buffer };
    const nodeBuffer = runtime.Buffer;
    let result: CameraImageResult;
    try {
      runtime.Buffer = undefined;
      result = await retrieve(
        response(200, { headers: imageHeaders, body: bytes }),
      );
    } finally {
      runtime.Buffer = nodeBuffer;
    }
    expect(result.kind === "image" && result.dataUri === expected).toBe(true);
  });

  test("does not report a body read that yields no buffer as an empty image", async () => {
    const served = response(200, {
      headers: imageHeaders,
      arrayBuffer: async () => undefined as unknown as ArrayBuffer,
    });
    await expect(retrieve(served)).resolves.toEqual({
      kind: "error",
      reason: "network",
    });
  });

  test.each<[string, CameraFetchResponse]>([
    [
      "arrayBuffer",
      response(200, {
        headers: imageHeaders,
        arrayBuffer: () => Promise.reject(new Error("connection reset")),
      }),
    ],
    [
      "Blob",
      response(200, {
        headers: imageHeaders,
        blob: () => Promise.reject(new Error("connection reset")),
      }),
    ],
  ])(
    "maps a %s read that rejects to a network error",
    async (_path, served) => {
      await expect(retrieve(served)).resolves.toEqual({
        kind: "error",
        reason: "network",
      });
    },
  );

  test("maps a blob whose bytes cannot be read to a network error", async () => {
    const unreadable = {
      size: png.byteLength,
      type: "image/png",
      arrayBuffer: () => Promise.reject(new Error("blob released")),
    } as unknown as Blob;
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { headers: imageHeaders, blob: async () => unreadable }),
    );
    await expect(fetchCameraImage(request, { fetchImpl })).resolves.toEqual({
      kind: "error",
      reason: "network",
    });
  });

  test("maps a Blob-only response whose Blob has no arrayBuffer to a network error", async () => {
    // React Native's own Blob exposes size and type but no byte access.
    const opaque = { size: png.byteLength, type: "image/png" } as Blob;
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { headers: imageHeaders, blob: async () => opaque }),
    );
    await expect(fetchCameraImage(request, { fetchImpl })).resolves.toEqual({
      kind: "error",
      reason: "network",
    });
  });
});

describe("fetchCameraImage after the headers arrive", () => {
  test.each([
    ["empty", ""],
    ["unparseable", "not a url"],
  ])(
    "refuses a response whose final URL is %s without reading its body",
    async (_label, url) => {
      const arrayBuffer = jest.fn(async () => bufferOf(png));
      const blob = jest.fn(async () => new Blob([bufferOf(png)]));
      const fetchImpl: CameraFetch = jest.fn(async () => ({
        ...response(200, { url, headers: imageHeaders, arrayBuffer }),
        blob,
      }));
      await expect(fetchCameraImage(request, { fetchImpl })).resolves.toEqual({
        kind: "error",
        reason: "unverified_origin",
      });
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(blob).not.toHaveBeenCalled();
    },
  );

  test("does not read the body of a response that is not an image", async () => {
    const arrayBuffer = jest.fn(async () => bufferOf(png));
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { headers: { "content-type": "text/html" }, arrayBuffer }),
    );
    await expect(fetchCameraImage(request, { fetchImpl })).resolves.toEqual({
      kind: "error",
      reason: "not_an_image",
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  test("does not attribute a status to Home Assistant when the origin is unproven", async () => {
    for (const [url, reason] of [
      ["", "unverified_origin"],
      [
        "https://evil.example/api/camera_proxy/camera.door",
        "cross_origin_redirect",
      ],
    ] as const) {
      const fetchImpl: CameraFetch = jest.fn(async () =>
        response(404, { url }),
      );
      await expect(fetchCameraImage(request, { fetchImpl })).resolves.toEqual({
        kind: "error",
        reason,
      });
    }
  });

  test("refuses a request URI whose origin cannot be compared", async () => {
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { url: "file:///tmp/image.png", headers: imageHeaders }),
    );
    await expect(
      fetchCameraImage(
        { uri: "file:///tmp/image.png", headers: request.headers },
        { fetchImpl },
      ),
    ).resolves.toEqual({ kind: "error", reason: "network" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test.each<[string, CameraFetch]>([
    [
      "throws synchronously",
      () => {
        throw new Error("no transport");
      },
    ],
    ["resolves without a response", async () => undefined as never],
    [
      "returns headers that throw",
      async () => ({
        ...response(200),
        headers: {
          get: () => {
            throw new Error("headers unavailable");
          },
        },
      }),
    ],
    [
      "throws from arrayBuffer() synchronously",
      async () =>
        response(200, {
          headers: imageHeaders,
          arrayBuffer: () => {
            throw new TypeError("body already used");
          },
        }),
    ],
    [
      "throws from blob() synchronously",
      async () =>
        response(200, {
          headers: imageHeaders,
          blob: () => {
            throw new TypeError("body already used");
          },
        }),
    ],
  ])("never rejects when the transport %s", async (_label, fetchImpl) => {
    await expect(fetchCameraImage(request, { fetchImpl })).resolves.toEqual({
      kind: "error",
      reason: "network",
    });
  });
});

describe("fetchCameraImage deadline and abort", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("times out when the server never answers", async () => {
    const fetchImpl: CameraFetch = jest.fn(
      () => new Promise<CameraFetchResponse>(() => {}),
    );
    const settled = settlement(fetchCameraImage(request, { fetchImpl }));
    await jest.advanceTimersByTimeAsync(14_999);
    expect(settled).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith({ kind: "error", reason: "timeout" });
  });

  test.each<[string, () => CameraFetchResponse]>([
    [
      "arrayBuffer",
      () =>
        response(200, { headers: imageHeaders, arrayBuffer: () => stalled() }),
    ],
    ["Blob", () => response(200, { headers: imageHeaders, blob: stalled })],
  ])(
    "times out when %s is still being read at the deadline, and stops the transport",
    async (_path, serve) => {
      let transport: AbortSignal | undefined;
      const fetchImpl: CameraFetch = jest.fn(async (_url, init) => {
        transport = init.signal;
        return serve();
      });
      const settled = settlement(fetchCameraImage(request, { fetchImpl }));
      await jest.advanceTimersByTimeAsync(14_999);
      expect(settled).not.toHaveBeenCalled();
      expect(transport?.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith({
        kind: "error",
        reason: "timeout",
      });
      expect(transport?.aborted).toBe(true);
    },
  );

  test("times out when the Blob arrives but its bytes do not", async () => {
    const pending = {
      size: png.byteLength,
      type: "image/png",
      arrayBuffer: () => stalled<ArrayBuffer>(),
    } as unknown as Blob;
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { headers: imageHeaders, blob: async () => pending }),
    );
    const settled = settlement(fetchCameraImage(request, { fetchImpl }));
    await jest.advanceTimersByTimeAsync(15_000);
    expect(settled).toHaveBeenCalledWith({ kind: "error", reason: "timeout" });
  });

  test("spends one 15 s budget across redirect hops, not one per hop", async () => {
    // Every hop answers after 6 s: no single hop is slow, the retrieval is.
    const fetchImpl: CameraFetch = jest.fn(
      (url) =>
        new Promise<CameraFetchResponse>((resolve) => {
          setTimeout(
            () =>
              resolve(response(302, { url, headers: { location: "/again" } })),
            6_000,
          );
        }),
    );
    const settled = settlement(fetchCameraImage(request, { fetchImpl }));
    await jest.advanceTimersByTimeAsync(15_000);
    expect(settled).toHaveBeenCalledWith({ kind: "error", reason: "timeout" });
    // Hops left at 0 s, 6 s and 12 s; none leaves after the deadline.
    await jest.advanceTimersByTimeAsync(30_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("ends as a network error when the caller aborts during the body read", async () => {
    const caller = new AbortController();
    let transport: AbortSignal | undefined;
    const fetchImpl: CameraFetch = jest.fn(async (_url, init) => {
      transport = init.signal;
      return response(200, {
        headers: imageHeaders,
        arrayBuffer: () => stalled(),
      });
    });
    const settled = settlement(
      fetchCameraImage(request, { fetchImpl, signal: caller.signal }),
    );
    await jest.advanceTimersByTimeAsync(1_000);
    expect(settled).not.toHaveBeenCalled();

    caller.abort();
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledWith({ kind: "error", reason: "network" });
    expect(transport?.aborted).toBe(true);
    // The deadline does not outlive the retrieval it bounded.
    expect(jest.getTimerCount()).toBe(0);
  });

  test("does not send the request when the caller has already aborted", async () => {
    const caller = new AbortController();
    caller.abort();
    const fetchImpl: CameraFetch = jest.fn(async () =>
      response(200, { headers: imageHeaders, body: png }),
    );
    await expect(
      fetchCameraImage(request, { fetchImpl, signal: caller.signal }),
    ).resolves.toEqual({ kind: "error", reason: "network" });
    expect(fetchImpl).not.toHaveBeenCalled();
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

  describe("memory budget", () => {
    const CACHE_BUDGET_CHARS = 24 * 1024 * 1024;
    // The largest image the transport accepts: 5 MB of bytes as base64.
    const largest: CameraImageResult = {
      ...image,
      dataUri: `data:image/png;base64,${"A".repeat(Math.ceil((5 * 1024 * 1024) / 3) * 4)}`,
    };
    const key = (index: number) => cameraCacheKey("ha:big", `entity:${index}`);
    const retainedIndexes = (count: number) =>
      Array.from({ length: count }, (_, index) => index).filter(
        (index) => readCameraCache(key(index)) !== undefined,
      );
    beforeEach(() => {
      clearCameraCache("ha:a");
      clearCameraCache("ha:big");
    });
    afterAll(() => {
      clearCameraCache("ha:big");
    });

    test("bounds the retained data-URI characters, not only the entry count", () => {
      for (let i = 0; i < 16; i++) writeCameraCache(key(i), largest);
      const retained = retainedIndexes(16);
      const characters = retained.reduce((total, index) => {
        const entry = readCameraCache(key(index));
        return total + (entry?.kind === "image" ? entry.dataUri.length : 0);
      }, 0);
      expect(characters).toBeLessThanOrEqual(CACHE_BUDGET_CHARS);
      // The least recently written images went first.
      expect(retained).toEqual([13, 14, 15]);
    });

    test("writing an entry again keeps it ahead of older ones", () => {
      for (let i = 0; i < 3; i++) writeCameraCache(key(i), largest);
      writeCameraCache(key(0), largest);
      writeCameraCache(key(3), largest);
      expect(retainedIndexes(4)).toEqual([0, 2, 3]);
    });

    test("does not retain an entry that could never fit, nor evict others for it", () => {
      writeCameraCache(key(0), image);
      writeCameraCache(key(1), {
        ...image,
        dataUri: `data:image/png;base64,${"A".repeat(CACHE_BUDGET_CHARS)}`,
      });
      expect(retainedIndexes(2)).toEqual([0]);
    });
  });

  test("evicts one entry without touching the rest of the profile", () => {
    const door = cameraCacheKey("ha:evict", "entity:door");
    const yard = cameraCacheKey("ha:evict", "entity:yard");
    writeCameraCache(door, image);
    writeCameraCache(yard, image);
    evictCameraCache(door);
    expect(readCameraCache(door)).toBeUndefined();
    expect(readCameraCache(yard)).toEqual(image);
    clearCameraCache("ha:evict");
  });
});
