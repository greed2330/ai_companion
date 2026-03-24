import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import MainWindow from "../pages/MainWindow";

jest.mock("../hooks/useMoodStream", () => jest.fn());
jest.mock("../hooks/useAfkDetection", () => jest.fn());

const useMoodStream = jest.requireMock("../hooks/useMoodStream");

describe("MainWindow", () => {
  beforeEach(() => {
    useMoodStream.mockImplementation(({ onRoomChange }) => {
      window.__roomChangeHandler = onRoomChange;
      return { mode: "stream" };
    });
    window.hanaDesktop.onSetTab.mockImplementation((callback) => {
      window.__setTabHandler = callback;
      return () => {
        window.__setTabHandler = null;
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.__roomChangeHandler = null;
    window.__setTabHandler = null;
  });

  test("IPC set-tab switches to settings tab", async () => {
    render(<MainWindow />);

    act(() => {
      window.__setTabHandler("settings");
    });
    expect(await screen.findByTestId("settings-panel")).toBeInTheDocument();
  });

  test("room_change event updates current room and shows bubble", async () => {
    render(<MainWindow />);

    act(() => {
      window.__roomChangeHandler({
        room_type: "coding",
        message: "코딩 대화로 바꿀게~"
      });
    });

    await waitFor(() =>
      expect(screen.getByText("코딩")).toBeInTheDocument()
    );
    expect(window.hanaDesktop.showBubble).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "코딩 대화로 바꿀게~",
        mood: "CURIOUS",
        type: "alert"
      })
    );
  });

  test("manual room override ignores later auto room changes", async () => {
    render(<MainWindow />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }));
    fireEvent.click(screen.getByRole("button", { name: /코딩/i }));

    act(() => {
      window.__roomChangeHandler({
        room_type: "game",
        message: "게임 대화로 바꿀게~"
      });
    });

    await waitFor(() =>
      expect(screen.getByText("코딩")).toBeInTheDocument()
    );
    expect(screen.queryByText("게임")).not.toBeInTheDocument();
  });
});
