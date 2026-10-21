/** Native keeps S02's suspended WebView behavior. */
export function useRendererActivity() {
  return { mount: true, visible: true, setHost: undefined };
}
