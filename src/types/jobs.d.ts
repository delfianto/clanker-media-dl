import type { HosterId } from "./hoster";

export type DownloadJobStatus = "running" | "done" | "error" | "canceled";

export type LogLevel = "info" | "warn" | "error" | "debug";

// Persisted in chrome.storage.local under key "downloadLogs" as DownloadLog[].
// Written by the SW logger; read + cleared by the options page Logs tab.
export type DownloadLog = {
  ts: number;
  level: LogLevel;
  msg: string;
  jobId?: string;
};

export type DownloadJobItem = {
  displayName: string;
  filename: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
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
  items?: DownloadJobItem[];
};
