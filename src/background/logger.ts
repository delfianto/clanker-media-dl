import browser from "webextension-polyfill";
import type { DownloadLog, LogLevel } from "../types/jobs";
import type { MDLogMessage } from "../types/messages";

const LOGS_KEY = "downloadLogs";
const MAX_LOGS = 500;

export async function appendLog(level: LogLevel, msg: string, jobId?: string): Promise<void> {
  if (level === "debug") {
    const cfg = await browser.storage.local.get({ verboseLogging: false });
    if (!cfg["verboseLogging"]) return;
  }

  const entry: DownloadLog =
    jobId !== undefined ? { ts: Date.now(), level, msg, jobId } : { ts: Date.now(), level, msg };

  const raw = await browser.storage.local.get({ [LOGS_KEY]: [] });
  const logs: DownloadLog[] = [...((raw[LOGS_KEY] as DownloadLog[] | undefined) ?? []), entry];
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  await browser.storage.local.set({ [LOGS_KEY]: logs });

  const broadcast: MDLogMessage = { type: "MD_LOG", entry };
  void browser.runtime.sendMessage(broadcast).catch(() => {});
}

export async function getLogs(): Promise<DownloadLog[]> {
  const raw = await browser.storage.local.get({ [LOGS_KEY]: [] });
  return (raw[LOGS_KEY] as DownloadLog[] | undefined) ?? [];
}

export async function clearLogs(): Promise<void> {
  await browser.storage.local.set({ [LOGS_KEY]: [] });
}
