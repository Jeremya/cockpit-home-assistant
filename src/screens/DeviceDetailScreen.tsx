import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useCockpit } from "../core/store";
import { ReadingDetailContent } from "../components/details/ReadingDetailContent";
import { Screen } from "../components/ui";
import { useWorkspacePanel } from "../navigation/workspacePanel";
import { detailTargetFromRoute } from "../navigation/detailNavigation";

/** Route adapter: parameters and the only scroll container; content is shared. */
export function DeviceDetailScreen() {
  const params = useLocalSearchParams<{ key: string; profile?: string }>();
  const current = useCockpit((state) => state.profileId);
  // A legacy link without a home binds to the first home it is shown in.
  const [bound, setBound] = useState(current);
  if (bound === null && current !== null) setBound(current);
  const { paneled } = useWorkspacePanel();
  const target = detailTargetFromRoute({ name: "device/[key]", params }, bound);
  return (
    <Screen width="reading" narrow={paneled}>
      <ReadingDetailContent
        profileId={target?.profileId ?? null}
        entityKey={target?.kind === "reading" ? target.entityKey : params.key}
      />
    </Screen>
  );
}
