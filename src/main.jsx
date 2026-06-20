import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

import ErrorBoundary    from "./ErrorBoundary.jsx";

// Android hardware back button handling.
// - Android only: iOS has no hardware back button, and the web build
//   already gets correct back/forward behavior from the browser itself.
// - createHashRouter (used on native, see App.jsx) is backed by the
//   browser History API on location.hash, so window.history.back()
//   correctly triggers react-router's popstate/hashchange handling
//   and keeps routing in sync — no custom nav logic required.
// - Registered once at bootstrap (not inside a React effect) so it
//   isn't affected by StrictMode's double-invoke-in-dev behavior.
if (Capacitor.getPlatform() === "android") {
  CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      // At the root of history (e.g. "/"): match native Android
      // behavior and exit, instead of getting stuck on screen.
      CapacitorApp.exitApp();
    }
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
