import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useCockpit } from "../core/store";
import { session } from "../services/runtime";
import { sessionPresentation } from "../core/sessionPresentation";
import { Icon } from "./EntityIcon";
import { Body, Button, Panel, colors } from "./ui";
import { spacing, typography } from "../theme";

/** Not ready: the house status is unknown, and the surface says so in amber. */
export function SessionBanner() {
  const status = useCockpit((state) => state.status);
  const [checksVisible, setChecksVisible] = useState(false);
  if (status.kind === "ready") return null;
  const { title, detail, causes } = sessionPresentation(status);
  const actionable = status.kind === "error" || status.kind === "idle";
  return (
    <Panel style={banner.panel}>
      <View style={banner.head}>
        <View style={banner.icon}>
          <Icon
            name={actionable ? "alert-triangle" : "refresh-cw"}
            size={18}
            color={colors.warning}
          />
        </View>
        <View style={banner.copy}>
          <Text
            accessibilityRole="header"
            accessibilityLiveRegion="polite"
            style={banner.title}
          >
            {title}
          </Text>
          <Body style={banner.detail}>{detail}</Body>
        </View>
      </View>
      {!!causes.length && (
        <>
          <Button
            title={
              checksVisible
                ? "Hide connection checks"
                : "Show connection checks"
            }
            variant="quiet"
            accessibilityExpanded={checksVisible}
            onPress={() => setChecksVisible((visible) => !visible)}
            style={banner.disclosure}
          />
          {checksVisible && (
            <Body style={banner.detail}>
              Possible causes:{"\n"}
              {causes.join("\n")}
            </Body>
          )}
        </>
      )}
      {actionable && (
        <View style={banner.actions}>
          <Button
            title="Retry"
            onPress={() => {
              void session.retry().catch(() => undefined);
            }}
            secondary
            style={banner.action}
          />
          <Button
            title="Connection settings"
            onPress={() => router.push("/settings")}
            variant="quiet"
          />
        </View>
      )}
    </Panel>
  );
}
const banner = StyleSheet.create({
  panel: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  head: { flexDirection: "row", gap: spacing.md },
  icon: { paddingTop: 2 },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { ...typography.name, color: colors.warning, fontWeight: "600" },
  detail: { color: colors.text },
  disclosure: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
  },
  // Side by side where they fit, stacked on a narrow phone.
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 120, maxWidth: 240 },
});
