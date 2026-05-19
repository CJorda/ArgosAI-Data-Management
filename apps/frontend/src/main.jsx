import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";
import "./styles/dark-theme.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

function installInspectWarningBanner() {
  if (typeof window === "undefined") {
    return;
  }

  const asciiBanner = [
    "    _    ____   ____  ___  ____    _    ___ ",
    "   / \\  |  _ \\ / ___|/ _ \\/ ___|  / \\  |_ _|",
    "  / _ \\ | |_) | |  _| | | \\___ \\ / _ \\  | | ",
    " / ___ \\|  _ <| |_| | |_| |___) / ___ \\ | | ",
    "/_/   \\_\\_| \\_\\____|\\___/|____/_/   \\_\\___|",
    "",
    "ARGOS AI Platform - Developer Console",
    "No pegues codigo desconocido ni compartas tokens de acceso."
  ].join("\n");

  let lastShownAt = 0;
  const minIntervalMs = 5000;

  const showBanner = () => {
    const now = Date.now();
    if (now - lastShownAt < minIntervalMs) {
      return;
    }

    lastShownAt = now;
    console.warn(asciiBanner);
  };

  window.addEventListener("contextmenu", () => {
    showBanner();
  });

  window.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const devtoolsShortcut =
      key === "f12" ||
      (event.ctrlKey && event.shiftKey && (key === "i" || key === "j" || key === "c")) ||
      (event.metaKey && event.altKey && key === "i");

    if (devtoolsShortcut) {
      showBanner();
    }
  });
}

installInspectWarningBanner();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
