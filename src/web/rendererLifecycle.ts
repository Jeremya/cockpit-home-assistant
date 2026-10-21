/** Bounded, identifier-free counters, shared by all web renderer instances. */
let created = 0,
  disposed = 0,
  frames = 0,
  peakLive = 0;
export function rendererLifecycle() {
  return { created, disposed, frames, live: created - disposed, peakLive };
}
function publish() {
  // Read-only verification surface: numbers only, no renderer or application API.
  if (typeof document !== "undefined")
    document.documentElement.dataset.mauriceRenderers =
      JSON.stringify(rendererLifecycle());
}
export function rendererCreated() {
  created++;
  peakLive = Math.max(peakLive, created - disposed);
  publish();
}
export function rendererDisposed() {
  disposed++;
  publish();
}
export function rendererFrame() {
  frames++;
  publish();
}
