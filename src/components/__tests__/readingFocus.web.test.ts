/** @jest-environment jsdom */
import type { View } from "react-native";
import { restoreReadingFocus } from "../readingFocus.web";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  document.body.replaceChildren();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function hiddenRoute() {
  const route = document.createElement("div");
  const button = document.createElement("button");
  route.hidden = true;
  route.append(button);
  document.body.append(route);
  // jsdom has no layout engine; model only the navigator's hidden/visible bounds.
  jest
    .spyOn(button, "getClientRects")
    .mockImplementation(
      () => ({ length: route.hidden ? 0 : 1 }) as DOMRectList,
    );
  return { route, button, target: () => button as unknown as View };
}

test("return focus waits until the navigator exposes the existing route", async () => {
  const { route, button, target } = hiddenRoute();
  const cancel = restoreReadingFocus(target);
  try {
    jest.advanceTimersByTime(20);
    expect(document.activeElement === button).toBe(false);
    route.hidden = false;
    await Promise.resolve();
    expect(document.activeElement === button).toBe(true);
  } finally {
    cancel();
  }
});

test("leaving the route cancels a pending visibility observer", async () => {
  const { route, button, target } = hiddenRoute();
  const cancel = restoreReadingFocus(target);
  jest.advanceTimersByTime(20);
  cancel();
  route.hidden = false;
  await Promise.resolve();
  expect(document.activeElement === button).toBe(false);
});

test("return focus waits for a marker remounted after hidden-screen layout", async () => {
  const { route, button } = hiddenRoute();
  button.remove();
  const cancel = restoreReadingFocus(() =>
    button.isConnected ? (button as unknown as View) : null,
  );
  try {
    jest.advanceTimersByTime(20);
    route.hidden = false;
    route.append(button);
    await Promise.resolve();
    expect(document.activeElement).toBe(button);
  } finally {
    cancel();
  }
});

test.each(["invalidated", "cancelled"])(
  "%s origin never focuses a late-mounted marker",
  async (reason) => {
    const { route, button } = hiddenRoute();
    button.remove();
    let valid = true;
    const cancel = restoreReadingFocus(() =>
      valid
        ? button.isConnected
          ? (button as unknown as View)
          : null
        : undefined,
    );
    try {
      jest.advanceTimersByTime(20);
      if (reason === "cancelled") cancel();
      else {
        valid = false;
        route.hidden = false;
        await Promise.resolve();
        valid = true;
      }
      route.append(button);
      await Promise.resolve();
      expect(document.activeElement).not.toBe(button);
    } finally {
      cancel();
    }
  },
);

test("a mounted but disconnected ref can be replaced before layout settles", async () => {
  const { route, button } = hiddenRoute();
  button.remove();
  let target = button;
  const cancel = restoreReadingFocus(() => target as unknown as View);
  try {
    jest.advanceTimersByTime(20);
    target = document.createElement("button");
    jest
      .spyOn(target, "getClientRects")
      .mockReturnValue({ length: 1 } as DOMRectList);
    route.hidden = false;
    route.append(target);
    await Promise.resolve();
    expect(document.activeElement).toBe(target);
  } finally {
    cancel();
  }
});

test("visibility changes can make an unsuccessful focus request actionable", async () => {
  const { route, button, target } = hiddenRoute();
  route.hidden = false;
  route.style.visibility = "hidden";
  // Browser layout rectangles exist for visibility:hidden, but focus is refused.
  const focus = button.focus.bind(button);
  jest.spyOn(button, "focus").mockImplementation(() => {
    if (route.style.visibility !== "hidden") focus();
  });
  const cancel = restoreReadingFocus(target);
  try {
    jest.advanceTimersByTime(20);
    expect(document.activeElement).not.toBe(button);
    route.style.visibility = "visible";
    await Promise.resolve();
    expect(document.activeElement).toBe(button);
    const other = document.createElement("button");
    route.append(other);
    other.focus();
    await Promise.resolve();
    expect(document.activeElement).toBe(other);
  } finally {
    cancel();
  }
});
