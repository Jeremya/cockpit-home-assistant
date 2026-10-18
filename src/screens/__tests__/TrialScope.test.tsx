import { renderAsync } from "@testing-library/react-native";
import { HousePlanScreen } from "../HousePlanScreen";
import SceneLabRoute from "../../../app/scene-lab";
import { useCockpit } from "../../core/store";
import { emptyPreferences } from "../../preferences/types";
import { Redirect } from "expo-router";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Redirect: jest.fn(() => null),
}));
jest.mock("../../config/build", () => ({
  buildFeatures: { spatial3d: false },
}));
jest.mock("../../web/CockpitScene", () => () => null);

test("trial retains the 2D plan without exposing 3D or the scene lab", async () => {
  useCockpit.setState({
    mode: "demo",
    profileId: "demo",
    snapshot: null,
    status: { kind: "idle" },
    preferences: emptyPreferences(),
  });
  const screen = await renderAsync(<HousePlanScreen />);
  expect(screen.getByRole("tab", { name: "2D plan" })).toBeTruthy();
  expect(screen.queryByRole("tab", { name: "3D view" })).toBeNull();
  expect(screen.getByRole("button", { name: "Explore Kitchen" })).toBeTruthy();
  await renderAsync(<SceneLabRoute />);
  expect(Redirect).toHaveBeenCalledWith(
    expect.objectContaining({ href: "/house" }),
    undefined,
  );
});
