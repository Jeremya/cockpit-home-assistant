# Camera images — I01 / I02

Implemented 2026-10-26. A camera entity's detail shows its **latest available still image**, retrieved through Home Assistant's `GET /api/camera_proxy/<entity_id>` with the bearer token, without leaking the token into URLs, logs, the cache or any rendered output. The offline demo home shows a deterministic simulated frame so the full display and polling path runs without hardware.

Hardened 2026-11-16: every failure after the response headers arrive is now a visible result instead of an unhandled rejection, the whole retrieval shares one deadline, and the cache has a memory budget. The body is read through `response.arrayBuffer()` rather than a `Blob`, and Forget drops the profile's cached frames. See [Failure mapping](#failure-mapping), [Body read](#body-read) and [Memory bound](#memory-bound). This is source and automated evidence only; nothing here was built, installed or observed on a device.

## Scope

- **I01 — transport and redirect isolation.** `src/services/cameraImage.ts` is the only consumer of `HomeBackend.getCameraImageRequest`. It bounds size, content type and time, and refuses to forward the bearer to any origin other than the profile's own, including HTTPS→HTTP downgrades. It never rejects: every outcome is a `CameraImageResult`.
- **I02 — display and polling.** `src/components/camera/useCameraImage.ts` and `CameraImageCard.tsx` poll every 10 s only while the screen is focused and the app is foregrounded, never with overlapping requests. The cache is in-memory, bounded by entry count and by size, and keyed by profile + stable entity key.
- The demo camera (`camera.front_door`) returns a token-free `data:` PNG, exercising the same service and component with no network.

Live streaming, motion/event association (`cameraEventOverrides` remains reserved), and a Home-screen preview are explicitly out of this slice.

## Architecture

`SessionManager.cameraImageRequest(entityId)` validates the live session (ready, entity present and a camera) and delegates to the backend. It returns the raw `{ uri, headers }` only to the service layer; screens consume `useCameraImage`'s sanitized state.

```
SessionManager.cameraImageRequest ──► fetchCameraImage ──► CameraImageResult
        (validated)                      (origin-bound)       (token-free data URI)
                                                  │
                                    useCameraImage (poll/guard)
                                                  │
                                    CameraImageCard (display)
```

`CameraImageResult` is a narrow discriminated union: `image { dataUri, contentType, fetchedAt, capturedAt }`, `empty`, or `error { reason }`. `capturedAt` stays `null` until Home Assistant exposes a capture time; `fetchedAt` is never presented as the capture time.

## Security invariants

- The bearer is attached only to the profile origin. `resolveCameraRedirect` follows a redirect only when it stays on that origin and never downgrades HTTPS→HTTP; a cross-origin or downgrading redirect is refused **before** a second request is made. A redirect whose `Location` is missing or cannot be parsed is refused the same way.
- An opaque redirect (a platform that would not expose the target) is refused, never guessed.
- A response is trusted only once its final URL is proven to be on the request origin, and that check runs **before** its status, content type or body is read. A final URL on another origin is refused as `cross_origin_redirect`, even if a platform auto-followed despite `redirect: "manual"`. A final URL that is empty or unparseable is refused as `unverified_origin` (see below). A request URI whose own origin cannot be compared (`file:`, unparseable) is never sent.
- Size (5 MB), content type (`image/*`) and time (15 s for the whole retrieval) are bounded; at most 3 redirect hops.
- The token never enters the result, a log string or a cache key. The cache is memory-only and keyed per profile. `SessionManager.forget()` drops the frames through `clearCameraCache(profileId)` twice: for the active profile as soon as its local use has ended, before any step that can fail, and for the saved profile whose credentials it removes, which can be a different one. Only Forget does this; signing out of a browser session or connecting to another home leaves the frames in memory until they are evicted or the process ends.

## Failure mapping

`fetchCameraImage` is total: it never rejects. The table is the whole contract; the "Anything else" row is the catch-all that makes it so. The last row belongs to the card, which is where a retrieved frame is decoded.

| Stage | Condition | Result |
| --- | --- | --- |
| Request | URI unparseable or with an opaque origin | `error: network`, nothing sent |
| Request | Caller signal already aborted | `error: network`, nothing sent |
| Any hop | Transport rejects or throws | `error: network` |
| Any stage | The 15 s budget is spent (hops, body read or byte access) | `error: timeout`, transport aborted |
| Any stage | Caller aborts (body read included) | `error: network`, transport aborted |
| Redirect | Status 0 (opaque redirect) | `error: cross_origin_redirect` |
| Redirect | `Location` missing or unparseable | `error: cross_origin_redirect` |
| Redirect | Target on another origin / HTTPS→HTTP | `error: cross_origin_redirect` / `https_downgrade`, no second request |
| Redirect | More than 3 hops | `error: cross_origin_redirect` |
| Response | Final URL empty or unparseable | `error: unverified_origin`, status and body not read |
| Response | Final URL on another origin | `error: cross_origin_redirect`, status and body not read |
| Response | 401 or 403 / 404 / other non-2xx | `error: unauthorized` / `not_found` / `network` |
| Response | Content type not `image/*` | `error: not_an_image`, body not read |
| Body | `response.arrayBuffer()` rejects or throws (connection dropped mid-body) | `error: network` |
| Body | Fallback only: `blob()` rejects or throws, or the `Blob` has no usable `arrayBuffer()` | `error: network` |
| Body | The response offers neither `arrayBuffer()` nor `blob()` | `error: network` |
| Body | The read resolves without a buffer | `error: network`, never `empty` |
| Body | 0 bytes read | `empty` |
| Body | More than 5 MB read (`byteLength`) | `error: too_large` |
| Anything else | Any other exception in the retrieval | `error: network` |
| Display | The platform reports that a retrieved frame cannot be decoded (`Image` `onError`) | The card shows the `network` placeholder ("The image could not be loaded.") with no "Fetched" time, for that frame only; the next retrieved frame is tried again |

Three decisions behind it:

- **One budget, not one per hop.** The 15 s cover every redirect hop, the body read and the encoding together. A per-hop budget allowed up to four hops of 15 s each plus an unbounded body read, during which the no-overlap guard would also have blocked every later poll. When the budget is spent or the caller aborts, the transport's own abort signal fires and no further request is started.
- **`unverified_origin` for a final URL that proves nothing.** The response is refused because its origin cannot be proven. It is not reported as `cross_origin_redirect`, because no redirect was observed and the card would then state one ("redirects to another server"). It is not reported as `network`, because a policy refusal that would repeat on every poll must stay distinguishable from a transient transport failure — on a device this message identifies a platform that does not report where a response came from. The card says: "The image could not be verified as coming from Home Assistant and was not loaded."
- **Origin before status.** A 401 or 404 from a response of unproven origin is no longer shown as Home Assistant's answer.

The hook holds the same line independently of the service. `useCameraImage` catches anything `fetchCameraImage` or `session.cameraImageRequest` throws and shows it as `network`, so a regression in the service cannot leave "Loading image…" or a previous frame on screen. After any failed or empty retrieval the error replaces the frame **and the cached frame is evicted**, so a reopened detail starts from "Loading image…" rather than from an image older than a known failure. A result that arrives after the screen is left, or for another profile or entity, changes neither state nor cache.

## Body read

The bytes are read with `response.arrayBuffer()`. `response.blob()` is used only when a response offers no `arrayBuffer()`; a response with neither is a `network` error. The size bound, the empty check and the encoding all work on the bytes actually read, on either path, inside the single 15 s budget and only after the origin and content type have been accepted.

A `Blob` is not portable. As read in the installed sources, React Native 0.86.3's global `Blob` exposes a size but has no `arrayBuffer()`, so the earlier `blob()` → `blob.arrayBuffer()` read could not decode a real frame on the phone. What is established about `arrayBuffer()` on each runtime:

| Runtime | `response.arrayBuffer()` | Evidence |
| --- | --- | --- |
| Node 24 (`fetch`) | Present; a frame is retrieved byte-exact through it over a real socket | **Run**: `npm run proof:camera` |
| Android, Expo `fetch` (the global `fetch` on native in `expo` 57.0.30) | Declared on the response and implemented by a native function that resolves the buffered body; no `Blob` is involved | **Read** in `node_modules/expo` (`src/winter/fetch/FetchResponse.ts`, `android/.../fetch/ExpoFetchModule.kt`); not run |
| Android, React Native polyfill (only with `EXPO_PUBLIC_USE_RN_FETCH`) | Present, implemented over `Blob` and `FileReader.readAsArrayBuffer` | **Read** in `node_modules/whatwg-fetch` and `react-native`; not run |
| Chrome | The browser's own `fetch`, which `expo` does not replace on web; `Response.arrayBuffer()` is standard | **Read** (`node_modules/expo/src/winter/runtime.ts`); not run in a browser |

The bytes then become base64. Where `Buffer` exists (Node) it does the encoding; elsewhere the bytes are turned into a binary string in 32 KiB chunks and `btoa` encodes it. The second branch is the one a phone or a browser takes: it is automated in Jest with `Buffer` hidden and produces identical output, but that is V8, not Hermes.

## Memory bound

The cache keeps the last image per camera so a reopened detail can show it at once. It is bounded two ways, and the least recently written entry is evicted first:

- at most **16 entries**;
- at most **24 MB of data-URI characters** in total (`24 × 1024 × 1024`).

A data URI is base64 text. The largest image the transport accepts, 5 MB, costs about 7 MB of characters, so 16 such entries would previously have retained about 107 MB; now at most three are kept (about 21 MB). Ordinary camera stills are tens to hundreds of kilobytes, so in normal use the entry count is the bound that applies and the byte budget only limits the pathological case. An entry that could never fit is not retained and evicts nothing. Characters are counted, not bytes: engines that store ASCII strings compactly use about one byte per character, and none uses more than two.

The budget covers retained images only. A retrieval in flight additionally holds its own transient copies of one image (the byte buffer, the base64 string and, where `Buffer` is absent, an intermediate binary string), bounded by the 5 MB limit.

## Verification

- `src/services/__tests__/cameraImage.test.ts` covers origin parsing, redirect resolution (same-origin, cross-origin, downgrade, relative, unparseable), content-type/size/empty bounds, status mapping, opaque redirect refusal, every post-header row of the failure mapping (empty and unparseable final URL, origin-before-status, no body read for a refused response), the body read (through `arrayBuffer()` only, through `blob()` only, `arrayBuffer()` preferred when both exist, neither, no buffer, the 5 MB bound at and over the limit and the empty body on both paths, rejection and synchronous throw on both paths, a `Blob` without byte access, and identical base64 with `Buffer` hidden), the single deadline with fake timers (server never answers, body stalled on either path, slow hops that only exceed it together), caller abort before and during the body read, and both cache bounds.
- `scripts/prove-camera.ts` (`npm run proof:camera`) drives the real `fetchCameraImage` against two loopback origins with a fake bearer: same-origin success and same-origin redirect with the credential, and a cross-origin redirect that is refused before the second origin receives **any** request — and therefore no credential. What each origin received is recorded by the origin itself. The three paths run through a minimal transport that only offers a `Blob`, and again through Node's platform `fetch`, which reads `response.arrayBuffer()`, returns the frame byte-exact, and would follow the redirect if `redirect: "manual"` were not honoured. With the platform `fetch`, a body cut after the headers also resolves as `network`, and a caller abort during a stalled body resolves as `network` and closes the connection.
- `useCameraImage` and `CameraImageCard` tests cover polling, no-overlap, non-camera/not-ready refusal, the honest placeholder states, the error state after a rejected retrieval (first load and refresh), recovery on the next poll, eviction of the cached frame after a failure, no effect from a result or rejection that arrives after unmount, and a frame that fails to decode: the placeholder replaces the image and its fetched time, the next retrieved frame restores the image, and a retrieval error still shows its own message.
- `src/session/__tests__/SessionManager.test.ts` covers Forget: the forgotten profile's frames are gone and another profile's survive; the saved profile's frames go when a different attempt is current; the active profile's frames go even when the stored credentials cannot be read.
- Demo-only. No physical device or configured Home Assistant is contacted; real Ring image-path proof remains H01.

## Remaining gates

Evidence level for everything above: implemented and automated on Node/Jest. None of it is built, installed or observed on a device.

- **Redirect isolation is proven on Node only.** The proof runs through a transport that cannot follow redirects and through Node's platform `fetch`, which honours `redirect: "manual"`. Whether the fetch that runs on Android honours it is not established: React Native's own fetch polyfill may not, in which case the effective protection on Android is the post-hoc origin check — which refuses the response but cannot undo a request the platform already made. Read in the installed dependencies, not run: `expo` 57.0.30 replaces the global `fetch` on native with its own implementation unless `EXPO_PUBLIC_USE_RN_FETCH` is set, and that implementation disables OkHttp redirect following for any mode other than `follow`; React Native's polyfill (XHR-based) does not read the `redirect` option at all. Which one runs in an installed build, and what it does with a cross-origin redirect, must be observed on an installed Pixel build. A local OkHttp module (automatic redirects disabled, explicit same-origin validation) remains the fallback if that observation fails. This gate cannot be closed from source.
- **Decoding a real frame on Android is unobserved.** The known blocker is removed in source: the body no longer passes through React Native's `Blob` (see [Body read](#body-read)). No real frame has been retrieved on a phone, so three things on that path are still unproven there: that Expo's native `arrayBuffer()` resolves with the frame; that `btoa` exists on Hermes, which the encoding needs where `Buffer` is absent and which nothing in the installed sources establishes (if it is missing, the result is a visible `network` error, not a hang); and that the resulting data URI renders. The demo camera does not exercise any of this, because its data URI never reaches the body read.
- **A frame cut in transit may not be detected on Android.** Read in `node_modules/expo/android/.../fetch/NativeResponse.kt`, not run: after an I/O failure in the middle of a body, the native response still reaches its "body completed" state, so `arrayBuffer()` appears to resolve with the bytes received so far instead of rejecting. On Node the same cut rejects and ends as `network` (run in the proof). The service does not compare the bytes with `Content-Length` — that header is not comparable across platforms once a response has been transparently decompressed. The card covers only part of this: it shows "The image could not be loaded." when the platform reports that a frame cannot be decoded, but a truncated frame that the decoder draws anyway, even partially, raises no error and is still shown as an image. Whether `onError` fires for an undecodable data URI on Android is itself unobserved.
- **The size bound applies after the platform has read the body.** `arrayBuffer()` buffers the whole response before its size is checked; only the 15 s budget limits how much is transferred. A declared `Content-Length` is not pre-checked and the body is not streamed with a byte counter.
- **Forget relies on the session teardown to stop a retrieval in flight.** `forget()` clears the frames after ending local use, which is what makes a mounted card drop any later result. No test covers a card that is still mounted while Forget runs.
- **A retrieval is not cancelled when its screen is left.** The hook passes no abort signal, so an abandoned retrieval runs to completion or to the 15 s deadline in the background before its result is dropped.
- **"Loading image…" can persist without a request.** While the session is ready but declines to build a request, the hook retries every 10 s and the card keeps "Loading image…".
- **"Fetched" shows a time without a date.** A cached frame shown while polling is paused (session not ready) can be from an earlier day of the same process.
- Real camera image-path proof (H01) and a Home-screen preview (later I02 extension).
- Motion/event association with explicit per-camera overrides.
