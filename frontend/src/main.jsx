import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles/app.css";

window.__VITE_API_BASE_URL__ =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
