import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";
import { getCondition } from "../core/policy";
import type { EntityRecord } from "../core/types";
import { colors } from "./ui";
import { entityTint } from "../core/appearance";

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({
  name,
  color = colors.muted,
  size = 20,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return (
    <Feather
      name={name}
      color={color}
      size={size}
      accessible={false}
      aria-hidden
      importantForAccessibility="no"
    />
  );
}

export function entityAppearance(entity: EntityRecord, ready: boolean) {
  const deviceClass = entity.attributes.device_class;
  const icons: Record<string, IconName> = {
    lock: "lock",
    climate: "thermometer",
    fan: "wind",
    camera: "video",
    sensor: deviceClass === "battery" ? "battery" : "activity",
    binary_sensor: "radio",
    switch: "toggle-right",
    event: "bell",
  };
  if (deviceClass === "temperature") icons.sensor = "thermometer";
  const condition = getCondition(entity, ready);
  const tint = entityTint(entity.domain, condition);
  return { icon: icons[entity.domain] ?? "activity", tint };
}
