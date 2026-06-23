// Message shapes for the two hops a download takes:
//   MAIN ──postMessage──▶ ISOLATED ──runtime.sendMessage──▶ background SW
// and the responses back.
//
// The two hops have DIFFERENT wire formats for the image bytes on purpose:
//
//   • SW → ISOLATED uses browser.runtime.sendMessage, which Chrome serialises as
//     JSON by default (structured clone is opt-in and Chrome 148+ only). An
//     ArrayBuffer would be silently dropped, so the SW returns the bytes as a
//     base64 string instead — JSON-safe on every Chrome/Firefox version.
//   • ISOLATED → MAIN uses window.postMessage, which is real structured clone.
//     ISOLATED decodes the base64 back into an ArrayBuffer and transfers it
//     zero-copy (see MDMainResponse + the [buffer] transferable).

// ISOLATED → background service worker (browser.runtime.sendMessage)
export type MDFetchBlobRequest = {
  type: "MD_FETCH_BLOB";
  url: string;
};

export type MDFetchBlobResponse = { base64: string; contentType: string } | { error: string };

// MAIN → ISOLATED (window.postMessage)
export type MDMainRequest = {
  type: "MD_REQUEST";
  id: string;
  url: string;
};

// Decoded bytes handed to the MAIN world. ISOLATED reconstructs the ArrayBuffer
// from base64 and posts it as a transferable, so MAIN gets it zero-copy.
export type MDBlobResult = { buffer: ArrayBuffer; contentType: string } | { error: string };

// ISOLATED → MAIN (window.postMessage; result.buffer passed as a transferable)
export type MDMainResponse = {
  type: "MD_RESPONSE";
  id: string;
  result: MDBlobResult;
};
