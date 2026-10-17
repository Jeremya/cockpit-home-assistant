import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { Credentials } from "./credentials";
import { PreferencesStorage } from "../preferences/storage";
import { SessionManager } from "../session/SessionManager";
const secrets = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};
export const session = new SessionManager(
  new Credentials(AsyncStorage, secrets, randomUUID),
  new PreferencesStorage(AsyncStorage),
);
/** The only command API for screens. No backend connection/service JSON. */
export const commands = session.commands;
/** Transient outcomes only; observations remain in the authoritative cockpit store. */
export const commandStore = session.commandStore;
