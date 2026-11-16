import { ConceptA } from "./ConceptA";
import { ConceptB } from "./ConceptB";
import { ConceptC } from "./ConceptC";

export function PrototypeHome({ concept }: { concept: "a" | "b" | "c" }) {
  if (concept === "b") return <ConceptB />;
  if (concept === "c") return <ConceptC />;
  return <ConceptA />;
}
