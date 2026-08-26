import { app, safeStorage } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppSettings } from "../shared/types";

type SettingsFile = {
  apiKey?: string;
  secretsEnc?: string;
  secrets?: Record<string, string>;
};

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidSecretName(name: string): boolean {
  return NAME_RE.test(name) && !name.startsWith("CURSOR_");
}

async function settingsPath(): Promise<string> {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readSettings(): Promise<SettingsFile> {
  try {
    const raw = await readFile(await settingsPath(), "utf8");
    return JSON.parse(raw) as SettingsFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

async function writeSettings(data: SettingsFile): Promise<void> {
  const file = await settingsPath();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}

function decodeSecrets(file: SettingsFile): Record<string, string> {
  if (file.secretsEnc && safeStorage.isEncryptionAvailable()) {
    try {
      const parsed = JSON.parse(
        safeStorage.decryptString(Buffer.from(file.secretsEnc, "base64")),
      ) as Record<string, string>;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Fall through to plaintext map if the blob cannot be read.
    }
  }
  return file.secrets ?? {};
}

function encodeSecrets(secrets: Record<string, string>): Pick<SettingsFile, "secrets" | "secretsEnc"> {
  const json = JSON.stringify(secrets);
  if (safeStorage.isEncryptionAvailable()) {
    return {
      secretsEnc: safeStorage.encryptString(json).toString("base64"),
    };
  }
  return { secrets };
}

export async function getApiKey(): Promise<string | undefined> {
  const stored = (await readSettings()).apiKey?.trim();
  if (stored) return stored;
  return process.env.CURSOR_API_KEY?.trim() || undefined;
}

export async function hasApiKey(): Promise<boolean> {
  return Boolean(await getApiKey());
}

export async function requireApiKey(): Promise<string> {
  const key = await getApiKey();
  if (!key) {
    throw new Error(
      "No Cursor API key. Open Settings and paste a key from cursor.com/dashboard/api.",
    );
  }
  return key;
}

export async function saveApiKey(apiKey: string): Promise<void> {
  const current = await readSettings();
  current.apiKey = apiKey.trim();
  await writeSettings(current);
}

export async function getSecretEnv(): Promise<Record<string, string>> {
  const raw = decodeSecrets(await readSettings());
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const key = name.trim();
    const secret = value.trim();
    if (!isValidSecretName(key) || !secret) continue;
    env[key] = secret;
  }
  return env;
}

export async function listSecretNames(): Promise<string[]> {
  return Object.keys(await getSecretEnv()).sort();
}

export async function getPublicSettings(): Promise<AppSettings> {
  return {
    hasApiKey: await hasApiKey(),
    secrets: (await listSecretNames()).map((name) => ({ name })),
    appVersion: app.getVersion(),
  };
}

export async function upsertSecret(name: string, value: string): Promise<void> {
  const key = name.trim();
  if (!isValidSecretName(key)) {
    throw new Error(
      "Invalid name. Use A–Z, 0–9, and _, and do not start with CURSOR_.",
    );
  }
  const current = await readSettings();
  const secrets = decodeSecrets(current);
  const nextValue = value.trim();
  if (!nextValue && !secrets[key]) {
    throw new Error("Value is required");
  }
  if (nextValue) secrets[key] = nextValue;
  const encoded = encodeSecrets(secrets);
  await writeSettings({
    ...current,
    secrets: undefined,
    secretsEnc: undefined,
    ...encoded,
  });
}

export async function deleteSecret(name: string): Promise<void> {
  const current = await readSettings();
  const secrets = decodeSecrets(current);
  delete secrets[name.trim()];
  const encoded = encodeSecrets(secrets);
  await writeSettings({
    ...current,
    secrets: undefined,
    secretsEnc: undefined,
    ...encoded,
  });
}
