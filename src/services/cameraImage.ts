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
 * - A response is trusted only once its final URL is proven to be on the request
 *   origin, and that is checked before its status, type or body is read. A final
 *   URL on another origin is `cross_origin_redirect`. A final URL that is empty
 *   or unparseable is `unverified_origin`: the origin cannot be proven, so the
 *   response is refused, but no redirect was observed, so none is claimed — and
 *   it is not `network`, because a policy refusal must stay distinguishable from
 *   a transient transport failure.
 * - Size, content type and time are bounded. The token never enters the result,
 *   a log string or a cache key.
 *
 * Failure contract:
 * - `fetchCameraImage` is total: it never rejects. Whatever the transport does
 *   after the headers arrive — a body read or byte access that rejects, throws
 *   or is missing — becomes `{ kind: "error", reason: "network" }`.
 * - One 15 s budget covers the whole retrieval: every redirect hop, the body
 *   read and the encoding. It is not renewed per hop. Spending it yields
 *   `timeout`; a caller abort yields `network`. Either one also aborts the
 *   transport, and nothing further is sent.
 * - The image cache is bounded by entry count and by total data-URI characters.
 */

export type CameraImageError =
  | "cross_origin_redirect"
  | "unverified_origin"
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
/** Budget for the whole retrieval — hops, body read, encoding — not per hop. */
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

/**
 * The origin of `url` when it can be compared with another one, otherwise null.
 * An empty or unparseable URL, or one with an opaque origin (`file:`, `data:`),
 * proves nothing about where a response came from.
 */
function provenOrigin(url: string): string | null {
  try {
    const origin = originOf(url);
    return origin && origin !== "null" ? origin : null;
  } catch {
    return null;
  }
}

export type RedirectDecision =
  | { kind: "follow"; url: string }
  | { kind: "refuse"; reason: "cross_origin_redirect" | "https_downgrade" };

/**
 * Resolves a redirect Location against the request it came from and decides
 * whether the bearer may follow it. Refuses any target that leaves the original
 * origin or downgrades HTTPS to HTTP, and any target that is missing or cannot
 * be parsed: a redirect was observed and its destination cannot be shown to stay
 * on the origin.
 */
export function resolveCameraRedirect(
  originalOrigin: string,
  from: string,
  location: string | null,
): RedirectDecision {
  if (!location) return { kind: "refuse", reason: "cross_origin_redirect" };
  let original: URL;
  let target: URL;
  try {
    original = new URL(originalOrigin);
    target = new URL(location, from);
  } catch {
    return { kind: "refuse", reason: "cross_origin_redirect" };
  }
  if (original.protocol === "https:" && target.protocol === "http:")
    return { kind: "refuse", reason: "https_downgrade" };
  if (target.origin !== originalOrigin)
    return { kind: "refuse", reason: "cross_origin_redirect" };
  return { kind: "follow", url: target.toString() };
}

/**
 * One deadline and one caller-abort listener for a whole retrieval. Every
 * awaited step goes through `run`, which loses to the budget the moment it is
 * spent. Spending it — the deadline or a caller abort — also aborts the
 * transport, and no further step is started.
 */
interface RetrievalBudget {
  /** Given to the transport; aborted when the budget is spent. */
  readonly signal: AbortSignal;
  run<T>(step: () => Promise<T>): Promise<T>;
  /** Clears the deadline and the caller listener once the retrieval is over. */
  release(): void;
}

function openBudget(ms: number, caller?: AbortSignal): RetrievalBudget {
  const transport = new AbortController();
  let spentWith: Error | undefined;
  let spend!: (error: Error) => void;
  const spent = new Promise<never>((_resolve, reject) => {
    spend = reject;
  });
  // Observed here so a budget spent while no step is racing is never unhandled.
  spent.catch(() => undefined);
  const expire = (error: Error) => {
    spentWith ??= error;
    spend(error);
    transport.abort();
  };
  const timer = setTimeout(() => expire(new CameraImageTimeout()), ms);
  const onAbort = () => expire(new CameraImageAborted());
  if (caller?.aborted) onAbort();
  else caller?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: transport.signal,
    run<T>(step: () => Promise<T>): Promise<T> {
      if (spentWith) return Promise.reject(spentWith);
      // A step that settles after the budget won is still observed by the race.
      return Promise.race([step(), spent]);
    },
    release() {
      clearTimeout(timer);
      caller?.removeEventListener("abort", onAbort);
    },
  };
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
 * honest failure. It never rejects: every failure, including one after the
 * headers have arrived, is a `CameraImageResult`. The default fetch is the
 * platform fetch; tests and the loopback proof inject their own to control
 * redirect behavior precisely.
 */
export async function fetchCameraImage(
  request: CameraImageRequest,
  options: {
    fetchImpl?: CameraFetch;
    signal?: AbortSignal;
    now?: () => number;
  } = {},
): Promise<CameraImageResult> {
  let budget: RetrievalBudget | undefined;
  try {
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

    // Nothing is sent to a request URI whose origin cannot be compared.
    const originalOrigin = provenOrigin(uri);
    if (originalOrigin === null) return { kind: "error", reason: "network" };

    const fetchImpl: CameraFetch =
      options.fetchImpl ?? (globalThis.fetch as unknown as CameraFetch);
    const active = openBudget(CAMERA_TIMEOUT_MS, options.signal);
    budget = active;

    let current = uri;
    for (let hop = 0; hop <= CAMERA_MAX_REDIRECTS; hop++) {
      const target = current;
      const response = await active.run(() =>
        fetchImpl(target, {
          headers: request.headers,
          redirect: "manual",
          signal: active.signal,
        }),
      );

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

      // Fail closed before trusting anything else about the response: a
      // platform may have auto-followed a redirect despite `manual`, or may not
      // say where the response came from at all.
      const finalOrigin = provenOrigin(response.url);
      if (finalOrigin === null)
        return { kind: "error", reason: "unverified_origin" };
      if (finalOrigin !== originalOrigin)
        return { kind: "error", reason: "cross_origin_redirect" };

      if (response.status === 401 || response.status === 403)
        return { kind: "error", reason: "unauthorized" };
      if (response.status === 404)
        return { kind: "error", reason: "not_found" };
      if (!response.ok) return { kind: "error", reason: "network" };

      const contentType = (response.headers.get("content-type") ?? "")
        .split(";")[0]!
        .trim();
      if (!contentType.startsWith("image/"))
        return { kind: "error", reason: "not_an_image" };

      // The body is read inside the same budget: a stalled, dropped or
      // unreadable body ends as a result below, never as a pending promise.
      const blob = await active.run(() => response.blob());
      if (blob.size === 0) return { kind: "empty" };
      if (blob.size > CAMERA_MAX_BYTES)
        return { kind: "error", reason: "too_large" };

      const dataUri = await active.run(() => blobToDataUri(blob, contentType));
      return {
        kind: "image",
        dataUri,
        contentType,
        fetchedAt,
        capturedAt: null,
      };
    }
    return { kind: "error", reason: "cross_origin_redirect" };
  } catch (error) {
    // Total by contract. The spent deadline is a timeout; a caller abort and
    // anything the transport or platform threw or rejected with is `network`.
    return {
      kind: "error",
      reason: error instanceof CameraImageTimeout ? "timeout" : "network",
    };
  } finally {
    budget?.release();
  }
}

/**
 * Bounded in-memory cache keyed by profile and stable entity key.
 *
 * Two bounds apply together, and the least recently written entry goes first:
 * at most 16 entries, and at most 24 MB of data-URI characters in total. A data
 * URI is base64 text, so the largest image the transport accepts (5 MB) costs
 * about 7 MB of characters; 16 of them would retain about 107 MB, and under
 * this bound at most three are kept. Ordinary stills are far smaller, so the
 * entry count is what normally applies.
 */
const MAX_CACHED_IMAGES = 16;
const MAX_CACHED_CHARS = 24 * 1024 * 1024;
const imageCache = new Map<string, CameraImageResult>();

function cachedChars(result: CameraImageResult): number {
  return result.kind === "image" ? result.dataUri.length : 0;
}

export function cameraCacheKey(profileId: string, entityKey: string): string {
  return `${profileId}:${entityKey}`;
}

export function readCameraCache(key: string): CameraImageResult | undefined {
  return imageCache.get(key);
}

export function writeCameraCache(key: string, result: CameraImageResult): void {
  // Re-insert to keep it most-recently-used; Map preserves insertion order.
  imageCache.delete(key);
  // An entry that could never fit is not retained, and evicts nothing.
  if (cachedChars(result) > MAX_CACHED_CHARS) return;
  imageCache.set(key, result);
  let chars = 0;
  for (const cached of imageCache.values()) chars += cachedChars(cached);
  while (imageCache.size > MAX_CACHED_IMAGES || chars > MAX_CACHED_CHARS) {
    const oldest = imageCache.entries().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest[0]);
    chars -= cachedChars(oldest[1]);
  }
}

/** Drops one cached image, so a frame older than a failed retrieval is not reused. */
export function evictCameraCache(key: string): void {
  imageCache.delete(key);
}

/** Drops every cached image for a profile (used on Forget). */
export function clearCameraCache(profileId: string): void {
  const prefix = `${profileId}:`;
  for (const key of imageCache.keys()) {
    if (key.startsWith(prefix)) imageCache.delete(key);
  }
}
