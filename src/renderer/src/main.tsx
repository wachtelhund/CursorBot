import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installCloudApi, readCloudKey } from "./cloud-api";
import { isElectronBridge } from "./remote-api";
import { KeyGate } from "./key-gate";
import "./styles.css";

const electron = isElectronBridge();
if (!electron) installCloudApi();

function Root() {
  const [ready, setReady] = useState(() => electron || Boolean(readCloudKey()));
  if (!electron && !ready) {
    return (
      <KeyGate
        onReady={() => {
          installCloudApi();
          setReady(true);
        }}
      />
    );
  }
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
