import { Alert } from "react-native";

export interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

export function confirmAction({
  title,
  message,
  confirmLabel,
  onConfirm,
}: Confirmation) {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}
