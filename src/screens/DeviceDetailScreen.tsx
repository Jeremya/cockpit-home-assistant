import { useState } from "react";
import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useCockpit } from "../core/store";
import { ReadingDetailContent } from "../components/details/ReadingDetailContent";
import { styles } from "../components/ui";
import { detailTargetFromRoute } from "../navigation/detailNavigation";

/** Route adapter: parameters and the only scroll container; content is shared. */
export function DeviceDetailScreen() {
  const params = useLocalSearchParams<{ key: string; profile?: string }>();
  const current = useCockpit((state) => state.profileId);
  // A legacy link without a home binds to the first home it is shown in.
  const [bound, setBound] = useState(current);
  if (bound === null && current !== null) setBound(current);
  const target = detailTargetFromRoute({ name: "device/[key]", params }, bound);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { maxWidth: 880 }]}
    >
      <ReadingDetailContent
        profileId={target?.profileId ?? null}
        entityKey={target?.kind === "reading" ? target.entityKey : params.key}
      />
    </ScrollView>
  );
}
