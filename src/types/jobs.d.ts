import type { HosterId } from "./hoster";

export type DownloadJobStatus = "running" | "done" | "error";

export type LogLevel = "info" | "warn" | "error" | "debug";

// Persisted in chrome.storage.local under key "downloadLogs" as DownloadLog[].
// Written by the SW logger; read + cleared by the options page Logs tab.
export type DownloadLog = {
  ts: number;
  level: LogLevel;
  msg: string;
  jobId?: string;
};

// Persisted in chrome.storage.local under key "downloadJobs" as DownloadJob[].
// Written by the SW; read by the options page Downloads tab.
export type DownloadJob = {
  jobId: string;
  hosterId: HosterId;
  subfolder: string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  status: DownloadJobStatus;
  startedAt: number;
};
