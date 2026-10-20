export interface LocalConnection {
  url: string;
  token: string;
}

export function canLoadLocalConnection() {
  return false;
}

export async function loadLocalConnection(): Promise<LocalConnection> {
  throw new Error("Local connection loading is available in web development.");
}
