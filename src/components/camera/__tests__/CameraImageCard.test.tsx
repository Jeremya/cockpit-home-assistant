import { fireEvent, render } from "@testing-library/react-native";
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
    [
      "unverified_origin",
      /could not be verified as coming from Home Assistant/,
    ],
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

  describe("a retrieved frame that cannot be decoded", () => {
    const imageLabel = "Front door camera camera image";
    // A new element each time, so a rerender really renders the card again.
    const card = () => (
      <CameraImageCard entity={camera()} profileId="ha:a" ready />
    );
    // Like the hook, every render hands the card a fresh state object.
    const deliver = (dataUri: string, fetchedAt: string) =>
      mockUseCameraImage.mockImplementation(() => ({
        status: "loaded",
        dataUri,
        fetchedAt,
        capturedAt: null,
      }));

    test("is shown as a failure, without a fetched time, until the next frame", () => {
      deliver("data:image/png;base64,AAAA", "2026-10-26T12:00:00.000Z");
      const screen = render(card());
      expect(screen.getByText(/Fetched/)).toBeTruthy();

      fireEvent(screen.getByLabelText(imageLabel), "error", {
        nativeEvent: { error: "decode failed" },
      });
      expect(screen.getByText("The image could not be loaded.")).toBeTruthy();
      expect(screen.queryByLabelText(imageLabel)).toBeNull();
      expect(screen.queryByText(/Fetched/)).toBeNull();

      // Rendering the same frame again does not bring the blank image back.
      screen.rerender(card());
      expect(screen.getByText("The image could not be loaded.")).toBeTruthy();
      expect(screen.queryByLabelText(imageLabel)).toBeNull();

      deliver("data:image/png;base64,BBBB", "2026-10-26T12:00:10.000Z");
      screen.rerender(card());
      expect(screen.getByLabelText(imageLabel).props.source).toEqual({
        uri: "data:image/png;base64,BBBB",
      });
      expect(screen.queryByText("The image could not be loaded.")).toBeNull();
      expect(screen.getByText(/Fetched/)).toBeTruthy();
    });

    test("does not latch: a later retrieval of the same bytes is tried again", () => {
      deliver("data:image/png;base64,AAAA", "2026-10-26T12:00:00.000Z");
      const screen = render(card());
      fireEvent(screen.getByLabelText(imageLabel), "error", {
        nativeEvent: { error: "decode failed" },
      });
      expect(screen.queryByLabelText(imageLabel)).toBeNull();

      deliver("data:image/png;base64,AAAA", "2026-10-26T12:00:10.000Z");
      screen.rerender(card());
      expect(screen.getByLabelText(imageLabel)).toBeTruthy();
    });

    test("gives way to the retrieval's own failure", () => {
      deliver("data:image/png;base64,AAAA", "2026-10-26T12:00:00.000Z");
      const screen = render(card());
      fireEvent(screen.getByLabelText(imageLabel), "error", {
        nativeEvent: { error: "decode failed" },
      });

      mockUseCameraImage.mockImplementation(() => ({
        status: "error",
        reason: "timeout",
      }));
      screen.rerender(card());
      expect(screen.getByText("The image request timed out.")).toBeTruthy();
      expect(screen.queryByText("The image could not be loaded.")).toBeNull();
    });
  });
});
