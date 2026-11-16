/**
 * Authenticated camera still-image retrieval with origin-bound redirects.
 *
 * The HomeAssistant backend already produces a bearer-authenticated request for
 * `GET /api/camera_proxy/<entity_id>` (see `HomeBackend.getCameraImageRequest`).
 * This module is the only consumer of that request: it turns it into a sanitized,
 * token-free data URI and refuses to forward the bearer to any other origin.
 *
 * Security invariants (I01):
 * - The bearer is attached only to the request origin the profile supplied.
 * - A redirect is followed only when it stays on the same origin and never
 *   downgrades HTTPS -> HTTP. Cross-origin or downgrading redirects are refused
 *   before any further request is made.
 * - An opaque redirect (a platform that would not expose the target) is refused,
 *   never guessed.
 * - Size, content type and time are bounded. The token never enters the result,
 *   a log string or a cache key.
 */

export type CameraImageError =
  | "cross_origin_redirect"
  | "https_downgrade"
  | "not_an_image"
  | "too_large"
  | "timeout"
  | "not_found"
  | "unauthorized"
  | "network";

export type CameraImageResult =
  | {
      kind: "image";
      dataUri: string;
      contentType: string;
      /** When the app retrieved the image; never presented as capture time. */
      fetchedAt: string;
      /** Capture time is unknown unless HA exposes it; kept null for now. */
      capturedAt: string | null;
    }
  | { kind: "empty" }
  | { kind: "error"; reason: CameraImageError };

export interface CameraImageRequest {
  uri: string;
  headers: Record<string, string>;
}

/** Structural view of the fetch response the retriever needs. */
export interface CameraFetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly url: string;
  readonly headers: { get(name: string): string | null };
  blob(): Promise<Blob>;
}
export type CameraFetch = (
  url: string,
  init: {
    headers: Record<string, string>;
    redirect: "manual";
    signal?: AbortSignal;
  },
) => Promise<CameraFetchResponse>;

const CAMERA_MAX_BYTES = 5 * 1024 * 1024;
const CAMERA_TIMEOUT_MS = 15_000;
const CAMERA_MAX_REDIRECTS = 3;

class CameraImageTimeout extends Error {
  constructor() {
    super("Camera image request deadline");
  }
}
class CameraImageAborted extends Error {
  constructor() {
    super("Camera image request aborted");
  }
}

export function originOf(url: string): string {
  return new URL(url).origin;
}

export function sameOrigin(a: string, b: string): boolean {
  return a === b;
}

export type RedirectDecision =
  | { kind: "follow"; url: string }
  | { kind: "refuse"; reason: "cross_origin_redirect" | "https_downgrade" };

/**
 * Resolves a redirect Location against the request it came from and decides
 * whether the bearer may follow it. Refuses any target that leaves the original
 * origin or downgrades HTTPS to HTTP.
 */
export function resolveCameraRedirect(
  originalOrigin: string,
  from: string,
  location: string | null,
): RedirectDecision {
  if (!location) return { kind: "refuse", reason: "cross_origin_redirect" };
  const target = new URL(location, from);
  if (
    new URL(originalOrigin).protocol === "https:" &&
    target.protocol === "http:"
  )
    return { kind: "refuse", reason: "https_downgrade" };
  if (target.origin !== originalOrigin)
    return { kind: "refuse", reason: "cross_origin_redirect" };
  return { kind: "follow", url: target.toString() };
}

function raceTimeout<T>(
  promise: Promise<T>,
  ms: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CameraImageTimeout()), ms);
    const onAbort = () => reject(new CameraImageAborted());
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined")
    return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function blobToDataUri(blob: Blob, contentType: string): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${contentType};base64,${bytesToBase64(bytes)}`;
}

function dataUriContentType(uri: string): string {
  return /^data:([^;,]+)/.exec(uri)?.[1] ?? "";
}

/**
 * Retrieves a camera still image and returns a token-free data URI, or an
 * honest failure. The default fetch is the platform fetch; tests and the
 * loopback proof inject their own to control redirect behavior precisely.
 */
export async function fetchCameraImage(
  request: CameraImageRequest,
  options: {
    fetchImpl?: CameraFetch;
    signal?: AbortSignal;
    now?: () => number;
  } = {},
): Promise<CameraImageResult> {
  const now = options.now ?? (() => Date.now());
  const fetchedAt = new Date(now()).toISOString();
  const uri = request.uri;

  // Offline demo: a data URI is already decoded and carries no credential.
  if (uri.startsWith("data:")) {
    const contentType = dataUriContentType(uri);
    if (!contentType.startsWith("image/"))
      return { kind: "error", reason: "not_an_image" };
    return {
      kind: "image",
      dataUri: uri,
      contentType,
      fetchedAt,
      capturedAt: null,
    };
  }

  let originalOrigin: string;
  try {
    originalOrigin = originOf(uri);
  } catch {
    return { kind: "error", reason: "network" };
  }

  const fetchImpl: CameraFetch =
    options.fetchImpl ?? (globalThis.fetch as unknown as CameraFetch);

  let current = uri;
  for (let hop = 0; hop <= CAMERA_MAX_REDIRECTS; hop++) {
    let response: CameraFetchResponse;
    try {
      response = await raceTimeout(
        fetchImpl(current, {
          headers: request.headers,
          redirect: "manual",
          signal: options.signal,
        }),
        CAMERA_TIMEOUT_MS,
        options.signal,
      );
    } catch (error) {
      if (error instanceof CameraImageTimeout)
        return { kind: "error", reason: "timeout" };
      if (error instanceof CameraImageAborted)
        return { kind: "error", reason: "network" };
      return { kind: "error", reason: "network" };
    }

    // A platform whose manual redirect is opaque: the target is not inspectable.
    if (response.status === 0)
      return { kind: "error", reason: "cross_origin_redirect" };
    if (response.status >= 300 && response.status < 400) {
      const decision = resolveCameraRedirect(
        originalOrigin,
        current,
        response.headers.get("location"),
      );
      if (decision.kind === "refuse")
        return { kind: "error", reason: decision.reason };
      current = decision.url;
      continue;
    }

    if (response.status === 401 || response.status === 403)
      return { kind: "error", reason: "unauthorized" };
    if (response.status === 404) return { kind: "error", reason: "not_found" };
    if (!response.ok) return { kind: "error", reason: "network" };

    // Fail closed if a platform auto-followed a redirect despite `manual`.
    if (originOf(response.url) !== originalOrigin)
      return { kind: "error", reason: "cross_origin_redirect" };

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim();
    if (!contentType.startsWith("image/"))
      return { kind: "error", reason: "not_an_image" };

    const blob = await response.blob();
    if (blob.size === 0) return { kind: "empty" };
    if (blob.size > CAMERA_MAX_BYTES)
      return { kind: "error", reason: "too_large" };

    const dataUri = await blobToDataUri(blob, contentType);
    return {
      kind: "image",
      dataUri,
      contentType,
      fetchedAt,
      capturedAt: null,
    };
  }
  return { kind: "error", reason: "cross_origin_redirect" };
}

/** Bounded in-memory cache keyed by profile and stable entity key. */
const MAX_CACHED_IMAGES = 16;
const imageCache = new Map<string, CameraImageResult>();

export function cameraCacheKey(profileId: string, entityKey: string): string {
  return `${profileId}:${entityKey}`;
}

export function readCameraCache(key: string): CameraImageResult | undefined {
  return imageCache.get(key);
}

export function writeCameraCache(key: string, result: CameraImageResult): void {
  // Re-insert to keep it most-recently-used; Map preserves insertion order.
  imageCache.delete(key);
  imageCache.set(key, result);
  while (imageCache.size > MAX_CACHED_IMAGES) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
}

/** Drops every cached image for a profile (used on Forget). */
export function clearCameraCache(profileId: string): void {
  const prefix = `${profileId}:`;
  for (const key of imageCache.keys()) {
    if (key.startsWith(prefix)) imageCache.delete(key);
  }
}
