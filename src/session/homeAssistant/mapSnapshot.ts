import type {
  EntityRecord,
  EntityRegistryEntry,
  IdentityMetadata,
} from "../../core/types";
import { emptyIdentity } from "../../preferences/types";
import type { RawEntity } from "./entityStream";
const domains = new Set([
  "lock",
  "climate",
  "fan",
  "switch",
  "camera",
  "sensor",
  "binary_sensor",
  "event",
]);
const shallowEqual = (a: object, b: object) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([key, value]) =>
    Object.is(value, (b as Record<string, unknown>)[key]),
  );
export function mapSnapshot(
  raw: Record<string, RawEntity>,
  entries: EntityRegistryEntry[],
  registryFresh: boolean,
  known: IdentityMetadata = emptyIdentity(),
  previous: Record<string, EntityRecord> = {},
) {
  const registry = Object.fromEntries(
    entries.map((entry) => [entry.entity_id, entry]),
  );
  const identities: IdentityMetadata = {
    schemaVersion: 1,
    aliases: { ...known.aliases },
    entityKeys: registryFresh
      ? Object.fromEntries(entries.map((entry) => [entry.entity_id, entry.id]))
      : { ...known.entityKeys },
  };
  const entities: Record<string, EntityRecord> = {};
  for (const [entityId, state] of Object.entries(raw)) {
    const domain = entityId.split(".")[0]!;
    if (!domains.has(domain)) continue;
    const meta = registry[entityId];
    const key =
      meta?.id ??
      (registryFresh ? undefined : known.entityKeys[entityId]) ??
      `entity:${entityId}`;
    const fallback = `entity:${entityId}`;
    if (registryFresh && meta && known.entityKeys[entityId] === fallback)
      identities.aliases[fallback] = key;
    identities.entityKeys[entityId] = key;
    const old = previous[entityId];
    const attributes =
      old && shallowEqual(old.attributes, state.attributes)
        ? old.attributes
        : state.attributes;
    const entity: EntityRecord = {
      key,
      entityId,
      domain,
      state: state.state,
      attributes,
      lastChanged: state.last_changed,
      lastUpdated: state.last_updated,
      deviceId: meta?.device_id ?? null,
      areaId: meta?.area_id ?? null,
      entityCategory: meta?.entity_category ?? null,
      hiddenInHA: !!meta?.hidden_by,
      disabledInHA: !!meta?.disabled_by,
      name:
        meta?.name ??
        (typeof attributes.friendly_name === "string"
          ? attributes.friendly_name
          : entityId),
    };
    entities[entityId] = old && shallowEqual(old, entity) ? old : entity;
  }
  return { entities, identities };
}
