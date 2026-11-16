/**
 * Metro returns a public path string for non-image assets (including GLB) in
 * web and DOM-component bundles. The scene normalizes object/string forms.
 */
declare module "*.glb" {
  const url: string;
  export default url;
}
