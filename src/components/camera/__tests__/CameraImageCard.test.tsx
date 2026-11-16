import { render } from "@testing-library/react-native";
import type { EntityRecord } from "../../../core/types";
import { CameraImageCard } from "../CameraImageCard";
import { useCameraImage } from "../useCameraImage";

jest.mock("../useCameraImage", () => ({
  useCameraImage: jest.fn(),
}));
const mockUseCameraImage = useCameraImage as jest.Mock;

function camera(): EntityRecord {
  return {
    key: "entity:camera.front_door",
    entityId: "camera.front_door",
    domain: "camera",
    state: "idle",
    attributes: {},
    lastChanged: "2026-10-26T12:00:00.000Z",
    lastUpdated: "2026-10-26T12:00:00.000Z",
    deviceId: "demo-door",
    areaId: "entry",
    entityCategory: null,
    hiddenInHA: false,
    disabledInHA: false,
    name: "Front door camera",
  };
}

describe("CameraImageCard", () => {
  test("renders the loaded image and separates fetched from capture time", () => {
    mockUseCameraImage.mockReturnValue({
      status: "loaded",
      dataUri: "data:image/png;base64,AAAA",
      fetchedAt: "2026-10-26T12:00:00.000Z",
      capturedAt: null,
    });
    const screen = render(
      <CameraImageCard entity={camera()} profileId="ha:a" ready />,
    );
    expect(screen.getByText("Latest available image")).toBeTruthy();
    expect(screen.getByText(/Capture time unknown/)).toBeTruthy();
    expect(
      screen.getByLabelText("Front door camera camera image"),
    ).toBeTruthy();
  });

  test("shows the capture time when HA exposes it", () => {
    mockUseCameraImage.mockReturnValue({
      status: "loaded",
      dataUri: "data:image/png;base64,AAAA",
      fetchedAt: "2026-10-26T12:00:00.000Z",
      capturedAt: "2026-10-26T11:59:00.000Z",
    });
    const screen = render(
      <CameraImageCard entity={camera()} profileId="ha:a" ready />,
    );
    expect(screen.getByText(/Captured/)).toBeTruthy();
  });

  test.each([
    ["cross_origin_redirect", /redirects to another server/],
    ["https_downgrade", /unencrypted connection/],
    ["not_an_image", /did not return an image/],
    ["too_large", /too large/],
    ["timeout", /timed out/],
    ["not_found", /No recording available/],
    ["unauthorized", /rejected the request/],
    ["network", /could not be loaded/],
  ] as const)("renders an honest placeholder for %s", (reason, text) => {
    mockUseCameraImage.mockReturnValue({ status: "error", reason });
    const screen = render(
      <CameraImageCard entity={camera()} profileId="ha:a" ready />,
    );
    expect(screen.getByText(text)).toBeTruthy();
  });

  test("renders empty and loading placeholders", () => {
    mockUseCameraImage.mockReturnValue({ status: "empty" });
    const empty = render(
      <CameraImageCard entity={camera()} profileId="ha:a" ready />,
    );
    expect(empty.getByText("No recording available.")).toBeTruthy();

    mockUseCameraImage.mockReturnValue({ status: "loading" });
    const loading = render(
      <CameraImageCard entity={camera()} profileId="ha:a" ready />,
    );
    expect(loading.getByText("Loading image…")).toBeTruthy();
  });
});
