import { create } from "zustand";
import type { HomeSnapshot, SessionStatus } from "./types";
import {
  emptyPreferences,
  type ProfilePreferences,
} from "../preferences/types";
interface CockpitState {
  initialized: boolean;
  profileId: string | null;
  mode: "demo" | "homeAssistant" | null;
  status: SessionStatus;
  snapshot: HomeSnapshot | null;
  preferences: ProfilePreferences;
  /** The profile whose stored preferences are in `preferences`; edits are refused until it matches `profileId`. */
  preferencesLoadedFor: string | null;
  notices: string[];
}
export const useCockpit = create<CockpitState>(() => ({
  initialized: false,
  profileId: null,
  mode: null,
  status: { kind: "idle" },
  snapshot: null,
  preferences: emptyPreferences(),
  preferencesLoadedFor: null,
  notices: [],
}));
