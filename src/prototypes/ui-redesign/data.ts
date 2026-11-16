import type { IconName } from "../../components/EntityIcon";

/**
 * Public demo data only. These prototypes never open a Home Assistant session,
 * send a command or read a profile preference. "Simulated" stays visible so a
 * screenshot can never be mistaken for live household state.
 */
export interface DemoRoom {
  id: string;
  name: string;
  devices: number;
  on: number;
  status: string;
  tone: "ok" | "warning" | "neutral";
}

export interface DemoDevice {
  id: string;
  name: string;
  room: string;
  state: string;
  detail: string;
  tone: "ok" | "warning" | "neutral";
  icon: IconName;
  control: "toggle" | "read";
}

export const demoHome = {
  name: "Maison",
  greeting: "Good evening",
  date: "Wednesday, 28 October",
  attention: 1,
  attentionLabel: "1 thing needs attention",
  quietLabel: "Everything else is quiet",
  rooms: [
    {
      id: "living",
      name: "Living room",
      devices: 2,
      on: 1,
      status: "1 on",
      tone: "ok",
    },
    {
      id: "kitchen",
      name: "Kitchen",
      devices: 2,
      on: 0,
      status: "All closed",
      tone: "ok",
    },
    {
      id: "entry",
      name: "Entryway",
      devices: 1,
      on: 0,
      status: "Unlocked",
      tone: "warning",
    },
    {
      id: "office",
      name: "Office",
      devices: 1,
      on: 0,
      status: "21.5°C",
      tone: "neutral",
    },
  ] as DemoRoom[],
  devices: [
    {
      id: "lamp",
      name: "Living room lamp",
      room: "Living room",
      state: "On",
      detail: "Confirmed",
      tone: "ok",
      icon: "toggle-right",
      control: "toggle",
    },
    {
      id: "door",
      name: "Front door",
      room: "Entryway",
      state: "Unlocked",
      detail: "Read-only",
      tone: "warning",
      icon: "unlock",
      control: "read",
    },
    {
      id: "fridge",
      name: "Kitchen fridge",
      room: "Kitchen",
      state: "4°C",
      detail: "Door closed",
      tone: "neutral",
      icon: "thermometer",
      control: "read",
    },
    {
      id: "climate",
      name: "Hallway climate",
      room: "Office",
      state: "21.5°C",
      detail: "45% humidity",
      tone: "neutral",
      icon: "thermometer",
      control: "read",
    },
    {
      id: "feeder",
      name: "Cat feeder",
      room: "Kitchen",
      state: "Next feed 18:00",
      detail: "Last fed 08:00",
      tone: "neutral",
      icon: "clock",
      control: "read",
    },
  ] as DemoDevice[],
};

export const quickActions = [
  {
    id: "lights",
    label: "Lights",
    detail: "1 on",
    icon: "toggle-right" as IconName,
  },
  {
    id: "climate",
    label: "Climate",
    detail: "21.5°C",
    icon: "thermometer" as IconName,
  },
  {
    id: "security",
    label: "Security",
    detail: "1 alert",
    icon: "shield" as IconName,
  },
  { id: "rooms", label: "Rooms", detail: "4", icon: "grid" as IconName },
];
