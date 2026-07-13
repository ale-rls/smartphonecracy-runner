import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./style.css";

// App-shell-only service worker (plan §9); media stays app-controlled.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Non-fatal: the shell still runs without offline support.
  });
}

createRoot(document.getElementById("root")!).render(<App />);
