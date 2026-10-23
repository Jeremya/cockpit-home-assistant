import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { Credentials } from "./credentials";
import { PreferencesStorage } from "../preferences/storage";
import { SessionManager } from "../session/SessionManager";
import { connectionStorage, secretStorage } from "./credentialStorage";
import { webAuth } from "./auth/webAuthRuntime";
export const session = new SessionManager(
  new Credentials(connectionStorage, secretStorage, randomUUID),
  new PreferencesStorage(AsyncStorage),
  webAuth,
);
/** The only command API for screens. No backend connection/service JSON. */
export const commands = session.commands;
/** Transient outcomes only; observations remain in the authoritative cockpit store. */
export const commandStore = session.commandStore;
