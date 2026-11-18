import type { TextInputProps } from "react-native";

/** Keep a pasted Home Assistant token out of password managers.
 *
 * Android: `importantForAutofill="no"` (and `autoComplete="off"`, which React
 * Native maps to the same flag) keeps the field out of the Autofill framework,
 * so an Autofill service such as Google Password Manager is not asked to fill
 * it or offer to save it. iOS: `textContentType="none"` drops the password
 * hint. Web: `autocomplete="off"` is only a request; browsers may still offer
 * to save. These are declarations, not guarantees: the on-device result is
 * recorded in the stage0 evidence, not assumed here.
 *
 * Masking (`secureTextEntry`) and pasting are unaffected. */
export const secretEntryProps = {
  autoComplete: "off",
  importantForAutofill: "no",
  textContentType: "none",
  autoCapitalize: "none",
  autoCorrect: false,
  spellCheck: false,
} as const satisfies TextInputProps;
