import "./lib/migrateStorage"; // must run before the store reads its keys
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource-variable/spline-sans-mono";
import "./index.css";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WidgetWindow } from "./components/WidgetWindow";

// The floating live-widget window loads the same bundle with ?widget=1 (see open_widget in src-tauri).
const isWidget = new URLSearchParams(window.location.search).has("widget");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {isWidget ? <WidgetWindow /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);
