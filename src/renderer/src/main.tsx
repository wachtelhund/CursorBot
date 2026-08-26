import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installRemoteApi, isElectronBridge, readRemoteToken } from "./remote-api";
import { RemoteGate } from "./remote-gate";
import "./styles.css";

installRemoteApi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {!isElectronBridge() && !readRemoteToken() ? <RemoteGate /> : <App />}
  </StrictMode>,
);
