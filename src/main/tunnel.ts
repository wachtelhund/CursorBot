import { spawn, type ChildProcess } from "node:child_process";
import { parseCloudflaredUrl } from "../shared/remote";

export type TunnelHandle = {
  url: string;
  stop: () => void;
};

export function startCloudflareTunnel(
  port: number,
  onUrl: (url: string | undefined, error?: string) => void,
): { stop: () => void } {
  let child: ChildProcess | undefined;
  try {
    child = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    onUrl(undefined, "Install cloudflared, or use Tailscale and open the LAN link.");
    return { stop() {} };
  }

  let found: string | undefined;
  const onData = (buf: Buffer) => {
    const text = buf.toString("utf8");
    const url = parseCloudflaredUrl(text);
    if (url && url !== found) {
      found = url;
      onUrl(url);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", () => {
    onUrl(undefined, "Install cloudflared, or use Tailscale and open the LAN link.");
  });
  child.on("exit", (code) => {
    if (!found) {
      onUrl(
        undefined,
        code === 0
          ? undefined
          : "cloudflared exited. Install it or use Tailscale.",
      );
    }
  });

  return {
    stop() {
      child?.kill();
    },
  };
}
