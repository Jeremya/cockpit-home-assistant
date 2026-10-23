import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { DeviceSummaryContent } from "../components/details/DeviceSummaryContent";
import { styles } from "../components/ui";

/** Route adapter: parameters and the only scroll container; content is shared. */
export function DeviceSummaryScreen() {
  const { id, profile } = useLocalSearchParams<{
    id: string;
    profile: string;
  }>();
  const [width, setWidth] = useState(0);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <DeviceSummaryContent profileId={profile} deviceId={id} width={width} />
      </View>
    </ScrollView>
  );
}
