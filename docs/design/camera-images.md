# Camera images — I01 / I02

Implemented 2026-10-26. A camera entity's detail shows its **latest available still image**, retrieved through Home Assistant's `GET /api/camera_proxy/<entity_id>` with the bearer token, without leaking the token into URLs, logs, the cache or any rendered output. The offline demo home shows a deterministic simulated frame so the full display and polling path runs without hardware.

Hardened 2026-11-16: every failure after the response headers arrive is now a visible result instead of an unhandled rejection, the whole retrieval shares one deadline, and the cache has a memory budget. The body is read through `response.arrayBuffer()` rather than a `Blob`, and Forget drops the profile's cached frames. See [Failure mapping](#failure-mapping), [Body read](#body-read) and [Memory bound](#memory-bound).

Observed 2026-11-17 on Android (Seeker, proof APK `com.larrabee.homecockpit.s02proof`, SHA-256 `66a7f47f…`, source `0f6d5fb`) with the public camera fixture: see [Native evidence](#native-evidence). Two defects were reproduced there and are fixed after that build: a frame cut in transit was shown as an image, and leaving and resuming during a retrieval opened a second request. Both fixes then passed on the Seeker with candidate `948e642` (SHA-256 `adcdd1da…`), which contains them.

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
| Body | Native only (`verifyDeclaredLength`): fewer bytes than a plain-number `Content-Length` | `error: network` |
| Body | 0 bytes read | `empty` |
| Body | More than 5 MB read (`byteLength`) | `error: too_large` |
| Anything else | Any other exception in the retrieval | `error: network` |
| Display | The platform reports that a retrieved frame cannot be decoded (`Image` `onError`) | The card shows the `network` placeholder ("The image could not be loaded.") with no "Fetched" time, for that frame only; the next retrieved frame is tried again |

Three decisions behind it:

- **One budget, not one per hop.** The 15 s cover every redirect hop, the body read and the encoding together. A per-hop budget allowed up to four hops of 15 s each plus an unbounded body read, during which the no-overlap guard would also have blocked every later poll. When the budget is spent or the caller aborts, the transport's own abort signal fires and no further request is started.
- **`unverified_origin` for a final URL that proves nothing.** The response is refused because its origin cannot be proven. It is not reported as `cross_origin_redirect`, because no redirect was observed and the card would then state one ("redirects to another server"). It is not reported as `network`, because a policy refusal that would repeat on every poll must stay distinguishable from a transient transport failure — on a device this message identifies a platform that does not report where a response came from. The card says: "The image could not be verified as coming from Home Assistant and was not loaded."
- **Origin before status.** A 401 or 404 from a response of unproven origin is no longer shown as Home Assistant's answer.
- **Declared length, native only.** On Android, Expo's fetch resolved `arrayBuffer()` with the bytes received before a mid-body I/O failure, and the card drew a partial frame with a "Fetched" time (reproduced on the Seeker). Expo's `TransparentCompressionInterceptor` removes `Content-Length` whenever it decompresses, so on native a remaining `Content-Length` describes the bytes actually delivered, and a shorter body was cut. A browser can expose the compressed length of a body it decoded, so the hook turns the check on only when `Platform.OS !== "web"`. A body without `Content-Length` (chunked, or decompressed) is unchanged, so a cut chunked response can still go unseen.
- **No overlap across leave and resume.** The in-flight retrieval is held by the card, not by one run of the polling effect. Leaving (blur or background) and coming back before it settles waits for that same retrieval and applies its result instead of opening a second request; polling resumes once it settles. Reproduced on the Seeker before the fix: two simultaneous requests to one camera.

The hook holds the same line independently of the service. `useCameraImage` catches anything `fetchCameraImage` or `session.cameraImageRequest` throws and shows it as `network`, so a regression in the service cannot leave "Loading image…" or a previous frame on screen. After any failed or empty retrieval the error replaces the frame **and the cached frame is evicted**, so a reopened detail starts from "Loading image…" rather than from an image older than a known failure. A result that arrives after the screen is left, or for another profile or entity, changes neither state nor cache.

## Body read

The bytes are read with `response.arrayBuffer()`. `response.blob()` is used only when a response offers no `arrayBuffer()`; a response with neither is a `network` error. The size bound, the empty check and the encoding all work on the bytes actually read, on either path, inside the single 15 s budget and only after the origin and content type have been accepted.

A `Blob` is not portable. As read in the installed sources, React Native 0.86.3's global `Blob` exposes a size but has no `arrayBuffer()`, so the earlier `blob()` → `blob.arrayBuffer()` read could not decode a real frame on the phone. What is established about `arrayBuffer()` on each runtime:

| Runtime | `response.arrayBuffer()` | Evidence |
| --- | --- | --- |
| Node 24 (`fetch`) | Present; a frame is retrieved byte-exact through it over a real socket | **Run**: `npm run proof:camera` |
| Android, Expo `fetch` (the global `fetch` on native in `expo` 57.0.30) | Resolves the buffered body; a real PNG is decoded, base64-encoded on Hermes and rendered | **Run** on the Seeker, 2026-11-17 (see [Native evidence](#native-evidence)); the transport was identified by its `Accept-Encoding: zstd, br, gzip` |
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
- `scripts/prove-camera.ts` (`npm run proof:camera`) drives the real `fetchCameraImage` through the nine scenarios of the public fixture `scripts/camera-fixture.mjs`, whose two loopback origins record what they received themselves (path, whether the credential was present, transport headers, time until the connection closed; never the token). Each scenario runs through a minimal Blob-only transport and through Node's platform `fetch`, which reads `response.arrayBuffer()` and would follow a redirect if `redirect: "manual"` were not honoured. Same-origin frames are byte-exact; a cross-origin redirect is refused before the second origin receives **any** request; the two scenarios that only end on the 15 s budget are ended by a caller abort to keep the proof short, and the connection is checked closed. The same fixture drives the [Android recipe](#native-evidence).
- `useCameraImage` and `CameraImageCard` tests cover polling, no-overlap, non-camera/not-ready refusal, the honest placeholder states, the error state after a rejected retrieval (first load and refresh), recovery on the next poll, eviction of the cached frame after a failure, no effect from a result or rejection that arrives after unmount, and a frame that fails to decode: the placeholder replaces the image and its fetched time, the next retrieved frame restores the image, and a retrieval error still shows its own message.
- `src/session/__tests__/SessionManager.test.ts` covers Forget: the forgotten profile's frames are gone and another profile's survive; the saved profile's frames go when a different attempt is current; the active profile's frames go even when the stored credentials cannot be read.
- Demo-only. No physical device or configured Home Assistant is contacted; real Ring image-path proof remains H01.

## Remaining gates

Evidence level for everything above: implemented and automated on Node/Jest. None of it is built, installed or observed on a device.

- **Fixes proven on the Seeker only.** The declared-length check and the shared in-flight retrieval pass on candidate `948e642` (see [Native evidence](#native-evidence)); a later build must replay the affected rows.
- **Pixel not run.** The native evidence is the Seeker only.
- **A cut chunked body is still undetectable on Android.** Without `Content-Length` there is nothing to compare; the card's `onError` remains the only signal, and a partial frame the decoder draws raises none.
- **The size bound applies after the platform has read the body.** `arrayBuffer()` buffers the whole response before its size is checked; only the 15 s budget limits how much is transferred. A declared `Content-Length` is not pre-checked and the body is not streamed with a byte counter.
- **Forget relies on the session teardown to stop a retrieval in flight.** `forget()` clears the frames after ending local use, which is what makes a mounted card drop any later result. On the Seeker, a camera reopened after Forget and reconnection showed "Loading image…" rather than the earlier frame; no test covers a card that is still mounted while Forget runs.
- **A retrieval is not cancelled when its screen is left.** The hook passes no abort signal, so an abandoned retrieval runs to completion or to the 15 s deadline in the background before its result is dropped (observed on the Seeker: closed by the client after 14,995 ms). Immediate cancellation on leave would be a contract change.
- **"Loading image…" can persist without a request.** While the session is ready but declines to build a request, the hook retries every 10 s and the card keeps "Loading image…".
- **"Fetched" shows a time without a date.** A cached frame shown while polling is paused (session not ready) can be from an earlier day of the same process.
- Real camera image-path proof (H01) and a Home-screen preview (later I02 extension).
- Motion/event association with explicit per-camera overrides.

## Native evidence

Seeker (Android 16), proof APK `com.larrabee.homecockpit.s02proof` 0.1.0 (1), SHA-256 `66a7f47f75e065d5c44929cc0e21ddc69bc022006312de3f437f1bd5df80580d`, source `0f6d5fb`, 2026-11-17. Fixture `scripts/camera-fixture.mjs` on ports 8124/8125 through `adb reverse`, public token. Each origin recorded what it received; captures show the fixture only.

| Scenario | Card on Android | Fixture log | Verdict |
| --- | --- | --- | --- |
| 1 image | Banded frame, "Fetched" time | A: credential; `Accept-Encoding: zstd, br, gzip` (Expo fetch) | Pass |
| 2 same-origin redirect | Frame | A: proxy then `/frames/same-origin.png`, both with credential | Pass |
| 3 cross-origin redirect | "The image redirects to another server and was not loaded." | A: one request; **B: 0 requests** | Pass |
| 4 not an image | "Home Assistant did not return an image." | A: one request | Pass |
| 5 undecodable bytes | "The image could not be loaded." (`onError`) | A: one request | Pass |
| 6 body cut in transit | **Partial frame with a "Fetched" time** | A: response not completed | **Fail at `0f6d5fb`**, fixed after |
| 7 body stalled | "The image request timed out." | Closed by the client at 15,015 ms | Pass |
| 8 no answer | "The image request timed out." | Closed by the client at 15,002 ms | Pass |
| 9 unauthorized | "Home Assistant rejected the request." | A: one request | Pass |
| Background at 3 s, resume at 5 s (scenario 7) | — | **Two requests open at once** | **Fail at `0f6d5fb`**, fixed after |
| Forget, reconnect, reopen (8 s delayed frame) | "Loading image…" then the new frame | — | Pass; control without Forget showed the cached frame first |

### After the fixes — candidate `948e642`

Seeker, same package, SHA-256 `adcdd1da50650303d194f15f13b6ee583836684feb331e44d600d12dd751f83e`, source `948e642` (contains `f8b0144`), 2026-11-17, same fixture and transport (Expo fetch).

| Check | Card on Android | Fixture log | Verdict |
| --- | --- | --- | --- |
| 6 body cut in transit | "The image could not be loaded.", no frame, no "Fetched" | A: response not completed | Pass |
| Background at 3 s, resume at 5.4 s (scenario 7) | "The image request timed out." after the budget | **One request open**; closed at 14,999 ms; next poll at 15.8 s | Pass |
| 3 cross-origin redirect | "The image redirects to another server and was not loaded." | **B: 0 requests** | Pass |
| 1 image | Frame, "Fetched" time | A: credential | Pass |
| Forget, reconnect, reopen (8 s delayed frame) | "Loading image…" then the new frame | — | Pass; control without Forget showed the cached frame first |
| Late result: retrieval in flight across Forget and reconnection | Reopened card: "Loading image…" | The earlier request was delivered at 10,010 ms, after reconnection | Pass; the late frame is not reused |

Still undetectable: a cut body with no `Content-Length` (chunked). Pixel not run.
