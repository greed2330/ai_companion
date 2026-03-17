import { fireEvent, render, screen } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import App from "../App";

test("Alt+H toggles chat overlay visibility", () => {
  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  expect(screen.getByTestId("chat-overlay")).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "h", altKey: true });
  expect(screen.queryByTestId("chat-overlay")).not.toBeInTheDocument();

  fireEvent.keyDown(window, { key: "h", altKey: true });
  expect(screen.getByTestId("chat-overlay")).toBeInTheDocument();
});
