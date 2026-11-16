import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { DeviceSummaryContent } from "../components/details/DeviceSummaryContent";
import { Screen } from "../components/ui";
import { useWorkspacePanel } from "../navigation/workspacePanel";

/** Route adapter: parameters and the only scroll container; content is shared. */
export function DeviceSummaryScreen() {
  const { id, profile } = useLocalSearchParams<{
    id: string;
    profile: string;
  }>();
  const [width, setWidth] = useState(0);
  const { paneled } = useWorkspacePanel();
  return (
    <Screen narrow={paneled}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <DeviceSummaryContent profileId={profile} deviceId={id} width={width} />
      </View>
    </Screen>
  );
}
