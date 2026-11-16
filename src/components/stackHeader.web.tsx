import { StyleSheet } from "react-native";
import {
  HeaderBackButton,
  type HeaderBackButtonProps,
} from "expo-router/react-navigation";

/** React Native Web ignores the header button's hitSlop, so its 30 px box is
 * the whole target. Draw the same back link with the app's 48 px minimum. */
export function stackHeaderLeft(
  props: HeaderBackButtonProps & { canGoBack?: boolean },
) {
  if (!props.canGoBack) return null;
  return <HeaderBackButton {...props} style={styles.target} />;
}

const styles = StyleSheet.create({
  target: {
    minWidth: 48,
    minHeight: 48,
    justifyContent: "center",
    marginVertical: 0,
    marginHorizontal: 4,
  },
});
