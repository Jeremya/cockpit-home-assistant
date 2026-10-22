import type { ReactNode } from "react";

/** Native keeps full-screen detail routes above Home. */
export function DetailWorkspace({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function useHomeInWorkspace() {
  return false;
}
