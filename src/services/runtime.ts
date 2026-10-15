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
