// Media file extension detection — shared between gallery SW and tests.
// Video/audio files get separate (lower) parallelism because CDNs throttle
// large parallel downloads.

const MEDIA_EXTS = new Set([
  "mp4",
  "mov",
  "mkv",
  "webm",
  "avi",
  "m4v",
  "wmv",
  "flv",
  "mpg",
  "mpeg",
  "ts",
  "3gp",
  "mp3",
  "wav",
  "flac",
  "aac",
  "ogg",
  "m4a",
  "opus",
  "wma",
]);

export function isMediaFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? MEDIA_EXTS.has(ext) : false;
}

const RETRYABLE_ERRORS = [
  "SERVER_FAILED",
  "SERVER_CONTENT_LENGTH_MISMATCH",
  "NETWORK_FAILED",
  "NETWORK_TIMEOUT",
  "NETWORK_DISCONNECTED",
  "NETWORK_SERVER_DOWN",
  "FILE_TRANSIENT_ERROR",
  "CRASH",
];

export function isTransientError(err: unknown): boolean {
  const msg = String(err);
  return RETRYABLE_ERRORS.some((e) => msg.includes(e));
}
