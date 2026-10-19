// These Node tooling packages must not enter Maurice's delivered JS.
export const toolingOnly = ["braces", "node-forge", "sprintf-js", "uuid"];

export function assertRuntimeMap(map) {
  let sources = 0;
  function inspect(part, depth = 0) {
    if (!part || part.version !== 3 || depth > 10)
      throw new Error("Invalid runtime source map");
    if (Array.isArray(part.sections) && part.sections.length) {
      for (const section of part.sections) inspect(section.map, depth + 1);
      return;
    }
    if (!Array.isArray(part.sources) || !part.sources.length)
      throw new Error("Runtime source map has no sources");
    for (const source of part.sources) {
      if (typeof source !== "string")
        throw new Error("Invalid runtime source entry");
      const path = `/${part.sourceRoot ?? ""}/${source}`.replaceAll("\\", "/");
      for (const name of toolingOnly)
        if (path.includes(`/node_modules/${name}/`))
          throw new Error(`Tooling-only dependency entered runtime: ${name}`);
      sources++;
    }
  }
  inspect(map);
  return sources;
}
