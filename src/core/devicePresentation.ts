import type { DeviceSummary } from "./deviceSummaries";
import type { EntityRecord, HomeSnapshot } from "./types";
import { primaryValue } from "./presentation";
import { assessEntity } from "./policy";
import { petlibroReadings } from "./devices/petlibro";

export interface SummaryReading {
  label: string;
  value: string;
  key: string | null;
  note?: string;
}
export function readingValue(
  entity: EntityRecord,
  snapshot: HomeSnapshot,
  now?: number,
) {
  return primaryValue(entity, snapshot.config, now);
}
export function presentDevice(
  summary: DeviceSummary,
  snapshot: HomeSnapshot,
  ready: boolean,
  now = Date.now(),
) {
  const { members, coverage } = summary;
  const roles = petlibroReadings(summary.device, members, snapshot);
  const primary =
    members.length === 1
      ? members[0]!
      : ["lock", "climate", "fan"].flatMap((domain) => {
          const found = members.filter((e) => e.domain === domain);
          return found.length === 1 ? found : [];
        })[0];
  const rows: SummaryReading[] = roles
    ? roles.map(({ label, entity, kind, role }) => {
        let value = entity
          ? readingValue(entity, snapshot, now)
          : "Not reported";
        if (
          entity &&
          kind === "weight" &&
          !["unknown", "unavailable"].includes(entity.state) &&
          (!Number.isFinite(Number(entity.state)) ||
            !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(entity.state) ||
            !["g", "kg", "mg", "oz", "lb"].includes(
              String(entity.attributes.unit_of_measurement),
            ))
        )
          value = "Quantity not verified";
        return {
          label,
          value,
          key: entity?.key ?? null,
          ...(entity &&
          role === "next_feed_time" &&
          Date.parse(entity.state) < now
            ? {
                note: "Announced time has passed; check the reported schedule.",
              }
            : {}),
        };
      })
    : members.slice(0, 3).map((entity) => ({
        label: entity.name,
        value: readingValue(entity, snapshot, now),
        key: entity.key,
      }));
  const headline = roles
    ? rows[0]!.value
    : primary
      ? readingValue(primary, snapshot, now)
      : `${members.length} readings`;
  const qualifiers: string[] = [];
  if (!ready) qualifiers.push("Cached · current state unknown");
  else {
    if (coverage.unavailable)
      qualifiers.push(
        coverage.unavailable === members.length
          ? "Readings unavailable"
          : "Partial availability",
      );
    if (coverage.unknown)
      qualifiers.push(
        `${coverage.unknown} ${coverage.unknown === 1 ? "reading needs" : "readings need"} interpretation`,
      );
    const knownIssues = summary.issues.filter((e) =>
      ["attention", "alert"].includes(assessEntity(e, true).condition),
    );
    if (knownIssues.length)
      qualifiers.push(
        `${knownIssues.length} reported ${knownIssues.length === 1 ? "issue" : "issues"} to review`,
      );
  }
  if (coverage.missing)
    qualifiers.push(
      `${coverage.missing} missing ${coverage.missing === 1 ? "reading" : "readings"}`,
    );
  if (summary.deviceId && !summary.device)
    qualifiers.push("Device metadata unavailable");
  if (coverage.metadataCached) qualifiers.push("Device metadata cached");
  if (
    roles?.some(
      (r) => !r.entity || ["unknown", "unavailable"].includes(r.entity.state),
    ) ||
    rows.some((r) =>
      ["Time not reported", "Quantity not verified"].includes(r.value),
    )
  )
    qualifiers.push("Summary incomplete");
  return {
    kind: roles
      ? "Feeder"
      : primary?.domain === "switch"
        ? "Plug / switch"
        : "Device",
    headline,
    rows,
    qualifiers,
    feeder: !!roles,
    primary,
  };
}
