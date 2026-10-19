import type { PropsWithChildren } from "react";
import { Image } from "react-native";
import { Link, usePathname, type Href } from "expo-router";
import { useCockpit } from "../core/store";
import { Icon, type IconName } from "./EntityIcon";
import { useResponsiveLayout } from "./layout";
import { colors } from "./ui";
import "./desktop.css";

const destinations: { href: Href; label: string; icon: IconName }[] = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/house", label: "Floor plan", icon: "layers" },
  { href: "/entities", label: "Devices & rooms", icon: "grid" },
  { href: "/diagnostics", label: "Diagnostics", icon: "activity" },
  { href: "/settings", label: "Connection", icon: "sliders" },
];

function selected(path: string, href: Href) {
  if (href === "/house") return path.startsWith("/house");
  if (href === "/entities")
    return ["/entities", "/appliance/", "/device/"].some((prefix) =>
      path.startsWith(prefix),
    );
  return path === href;
}

export function AppShell({ children }: PropsWithChildren) {
  const { desktop } = useResponsiveLayout();
  const path = usePathname();
  const { status, mode, snapshot } = useCockpit();
  const ready = status.kind === "ready";
  return (
    <div className="maurice-web">
      <a
        className="maurice-skip"
        href="#maurice-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("maurice-content")?.focus();
        }}
      >
        Skip to content
      </a>
      {desktop && (
        <aside className="maurice-sidebar" data-testid="desktop-sidebar">
          <Link href="/" dismissTo asChild>
            <a className="maurice-brand" aria-label="Maurice home">
              <Image
                source={require("../../assets/icon.png")}
                style={{ width: 40, height: 40, borderRadius: 13 }}
              />
              <span>
                <strong>MAURICE</strong>
                <small>Your home. His rules.</small>
              </span>
            </a>
          </Link>
          <p className="maurice-nav-label">Your workspace</p>
          <nav aria-label="Main navigation">
            {destinations.map(({ href, label, icon }) => (
              <Link
                key={String(href)}
                href={href}
                dismissTo={href === "/"}
                asChild
              >
                <a
                  className="maurice-nav-link"
                  aria-current={selected(path, href) ? "page" : undefined}
                >
                  <Icon
                    name={icon}
                    size={19}
                    color={selected(path, href) ? colors.accent : colors.muted}
                  />
                  <span>{label}</span>
                </a>
              </Link>
            ))}
          </nav>
          <div className="maurice-sidebar-status" role="status">
            <span className={ready ? "maurice-dot ready" : "maurice-dot"} />
            <span>
              {ready
                ? mode === "demo"
                  ? "Simulated home"
                  : "Connected to Home Assistant"
                : snapshot
                  ? "Cached observations"
                  : "Connect your home"}
            </span>
          </div>
        </aside>
      )}
      <main id="maurice-content" tabIndex={-1} className="maurice-main">
        {children}
      </main>
    </div>
  );
}
