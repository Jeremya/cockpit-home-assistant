import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { session } from "../services/runtime";
import { sessionPresentation } from "../core/sessionPresentation";
import { Body, Button, Panel, colors } from "./ui";
export function SessionBanner() {
  const status = useCockpit((state) => state.status);
  const [checksVisible, setChecksVisible] = useState(false);
  if (status.kind === "ready") return null;
  const { title, detail, causes } = sessionPresentation(status);
  return (
    <Panel>
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={{ color: colors.warning, fontSize: 16, fontWeight: "600" }}
      >
        {title}
      </Text>
      <Body>{detail}</Body>
      {!!causes.length && (
        <>
          <Button
            title={
              checksVisible
                ? "Hide connection checks"
                : "Show connection checks"
            }
            secondary
            accessibilityExpanded={checksVisible}
            onPress={() => setChecksVisible((visible) => !visible)}
          />
          {checksVisible && (
            <Body>
              Possible causes:{"\n"}
              {causes.join("\n")}
            </Body>
          )}
        </>
      )}
      {(status.kind === "error" || status.kind === "idle") && (
        <>
          <Button
            title="Retry"
            onPress={() => {
              void session.retry().catch(() => undefined);
            }}
            secondary
          />
          <Button
            title="Connection settings"
            onPress={() => router.push("/settings")}
            secondary
          />
        </>
      )}
    </Panel>
  );
}
