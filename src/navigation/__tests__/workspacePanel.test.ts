import { renderHook, act } from "@testing-library/react-native";
import { escapeAction } from "../detailNavigation";
import { publishWorkspacePanel, useWorkspacePanel } from "../workspacePanel";

const idle = {
  handled: false,
  inScene: false,
  editing: false,
  confirmation: false,
  open: true,
};
test("Escape cancels a pending confirmation before it closes the detail", () => {
  expect(escapeAction({ ...idle, confirmation: true })).toBe(
    "cancelConfirmation",
  );
  expect(escapeAction(idle)).toBe("closeDetail");
  expect(escapeAction({ ...idle, open: false })).toBe("none");
});
test.each([
  ["already handled, e.g. by the focused camera", { handled: true }],
  ["typed inside the scene", { inScene: true }],
  ["typed in a text field", { editing: true }],
])("Escape does nothing to the detail when %s", (_, change) => {
  expect(escapeAction({ ...idle, confirmation: true, ...change })).toBe("none");
});
test("the workspace publishes one bounded panel fact to the shell and layout", () => {
  const { result, unmount } = renderHook(() => useWorkspacePanel());
  expect(result.current).toEqual({ paneled: false, open: false });
  act(() => publishWorkspacePanel({ paneled: true, open: true }));
  expect(result.current).toEqual({ paneled: true, open: true });
  const same = result.current;
  act(() => publishWorkspacePanel({ paneled: true, open: true }));
  expect(result.current).toBe(same);
  act(() => publishWorkspacePanel({ paneled: false, open: false }));
  expect(result.current).toEqual({ paneled: false, open: false });
  unmount();
});
