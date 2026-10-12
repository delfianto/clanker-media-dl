// Page scripts share window.postMessage with us. Ignore their arbitrary payloads
// (including null, arrays, and primitives) before accessing protocol fields.
export function isMDMessage(value: unknown): value is Record<string, unknown> & { type: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "type" in value &&
    typeof value.type === "string" &&
    value.type.startsWith("MD_")
  );
}
