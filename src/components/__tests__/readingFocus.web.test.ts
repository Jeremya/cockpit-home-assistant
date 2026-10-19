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
