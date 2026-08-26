export const REMOTE_PORT = 47821;
export const TOKEN_QUERY = "t";

export type LanAddress = {
  address: string;
  internal: boolean;
};

export function tokenFromAuthorization(header: unknown): string | undefined {
  if (typeof header !== "string") return undefined;
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  return match?.[1];
}

export function tokenFromUrl(rawUrl: string, host = "http://127.0.0.1"): string | undefined {
  try {
    const url = new URL(rawUrl, host);
    return url.searchParams.get("token") ?? url.searchParams.get(TOKEN_QUERY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function requestToken(input: {
  authorization?: unknown;
  url?: string;
}): string | undefined {
  return tokenFromAuthorization(input.authorization) ?? tokenFromUrl(input.url ?? "");
}

export function lanIpv4(nics: Record<string, LanAddress[] | undefined>): string[] {
  const found: string[] = [];
  for (const list of Object.values(nics)) {
    if (!list) continue;
    for (const item of list) {
      if (item.internal) continue;
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(item.address)) continue;
      if (!found.includes(item.address)) found.push(item.address);
    }
  }
  return found;
}

export function phoneLink(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/#${TOKEN_QUERY}=${encodeURIComponent(token)}`;
}

export function parseCloudflaredUrl(text: string): string | undefined {
  const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(text);
  return match?.[0];
}

export function tokensEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
