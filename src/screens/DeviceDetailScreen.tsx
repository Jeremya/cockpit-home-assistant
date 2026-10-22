import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useCockpit } from "../core/store";
import { ReadingDetailContent } from "../components/details/ReadingDetailContent";
import { styles } from "../components/ui";

/** Route adapter: parameters and the only scroll container; content is shared. */
export function DeviceDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  // The existing entity route carries no profile; it follows the current home.
  const profileId = useCockpit((state) => state.profileId);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { maxWidth: 880 }]}
    >
      <ReadingDetailContent profileId={profileId} entityKey={key} />
    </ScrollView>
  );
}
