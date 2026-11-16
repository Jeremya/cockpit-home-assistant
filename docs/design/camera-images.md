# Camera images — I01 / I02

Implemented 2026-10-26. A camera entity's detail shows its **latest available still image**, retrieved through Home Assistant's `GET /api/camera_proxy/<entity_id>` with the bearer token, without leaking the token into URLs, logs, the cache or any rendered output. The offline demo home shows a deterministic simulated frame so the full display and polling path runs without hardware.

## Scope

- **I01 — transport and redirect isolation.** `src/services/cameraImage.ts` is the only consumer of `HomeBackend.getCameraImageRequest`. It bounds size, content type and time, and refuses to forward the bearer to any origin other than the profile's own, including HTTPS→HTTP downgrades.
- **I02 — display and polling.** `src/components/camera/useCameraImage.ts` and `CameraImageCard.tsx` poll every 10 s only while the screen is focused and the app is foregrounded, never with overlapping requests. The cache is in-memory, bounded, and keyed by profile + stable entity key.
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

- The bearer is attached only to the profile origin. `resolveCameraRedirect` follows a redirect only when it stays on that origin and never downgrades HTTPS→HTTP; a cross-origin or downgrading redirect is refused **before** a second request is made.
- An opaque redirect (a platform that would not expose the target) is refused, never guessed. A final-response URL whose origin differs from the request origin is refused even if a platform auto-followed despite `redirect: "manual"`.
- Size (5 MB), content type (`image/*`) and time (15 s) are bounded; at most 3 redirect hops.
- The token never enters the result, a log string or a cache key. The cache is memory-only and per-profile; `clearCameraCache` drops a profile's images on Forget.
- Native `redirect: "manual"` support and a local OkHttp module (automatic redirects disabled, explicit same-origin validation) remain the I01 native-acceptance item on an installed Pixel build.

## Verification

- `src/services/__tests__/cameraImage.test.ts` covers origin parsing, redirect resolution (same-origin, cross-origin, downgrade, relative), content-type/size/empty bounds, status mapping, opaque redirect refusal and the bounded cache.
- `scripts/prove-camera.ts` (`npm run proof:camera`) drives the real `fetchCameraImage` against two loopback origins with a fake bearer: same-origin success and same-origin redirect with the credential, and a cross-origin redirect that is refused before the second origin receives **any** request — and therefore no credential.
- `useCameraImage` and `CameraImageCard` tests cover polling, no-overlap, non-camera/not-ready refusal and the honest placeholder states.
- Demo-only. No physical device or configured Home Assistant is contacted; real Ring image-path proof remains H01.

## Remaining gates

- Native (installed Pixel) acceptance of redirect isolation and the OkHttp hardening if `redirect: "manual"` proves insufficient.
- Real camera image-path proof (H01) and a Home-screen preview (later I02 extension).
- Motion/event association with explicit per-camera overrides.
