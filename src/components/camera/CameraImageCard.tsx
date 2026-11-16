import { Image, StyleSheet, Text, View } from "react-native";
import type { EntityRecord } from "../../core/types";
import type { CameraImageError } from "../../services/cameraImage";
import { colors, spacing } from "../../theme";
import { Body, Label, Panel } from "../ui";
import { useCameraImage, type CameraImageState } from "./useCameraImage";

function errorMessage(reason: CameraImageError): string {
  switch (reason) {
    case "cross_origin_redirect":
      return "The image redirects to another server and was not loaded.";
    case "unverified_origin":
      return "The image could not be verified as coming from Home Assistant and was not loaded.";
    case "https_downgrade":
      return "The image would use an unencrypted connection and was not loaded.";
    case "not_an_image":
      return "Home Assistant did not return an image.";
    case "too_large":
      return "The image is too large to display.";
    case "timeout":
      return "The image request timed out.";
    case "not_found":
      return "No recording available — a subscription or recording may be required.";
    case "unauthorized":
      return "Home Assistant rejected the request.";
    case "network":
      return "The image could not be loaded.";
  }
}

function Placeholder({ text }: { text: string }) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>{text}</Text>
    </View>
  );
}

function CameraCaption({ image }: { image: CameraImageState }) {
  if (image.status !== "loaded") return null;
  return (
    <Body>
      {image.capturedAt
        ? `Captured ${new Date(image.capturedAt).toLocaleString()}`
        : "Capture time unknown"}
      {"\n"}
      Fetched {new Date(image.fetchedAt).toLocaleTimeString()}
    </Body>
  );
}

/**
 * Latest available still image for a camera entity. The data URI is the only
 * thing rendered: no authenticated URL or token ever reaches this component.
 */
export function CameraImageCard({
  entity,
  profileId,
  ready,
}: {
  entity: EntityRecord;
  profileId: string | null;
  ready: boolean;
}) {
  const image = useCameraImage({ entity, profileId, ready });
  return (
    <Panel>
      <Label>Latest available image</Label>
      {image.status === "loaded" ? (
        <Image
          source={{ uri: image.dataUri }}
          style={styles.image}
          resizeMode="cover"
          accessibilityLabel={`${entity.name} camera image`}
        />
      ) : image.status === "loading" ? (
        <Placeholder text="Loading image…" />
      ) : image.status === "empty" ? (
        <Placeholder text="No recording available." />
      ) : image.status === "error" ? (
        <Placeholder text={errorMessage(image.reason)} />
      ) : (
        <Placeholder text="Image unavailable." />
      )}
      <CameraCaption image={image} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  placeholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: colors.raised,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
