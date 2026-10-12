import type { GalleryJobItem } from "../types/messages";

export function downloadParallelism(value: number, fallback: number, max: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.min(max, Math.floor(value)) : fallback;
}

type CompletedItem = { filename: string };
type PreviousItem = { displayName: string; filename: string; status: string };

// Resuming the same job keeps its completed work. Cross-job history is optional
// and must never mark items done when the user has disabled skipping or forced
// a fresh download. Use the item's own subfolder for aggregator galleries.
export async function findCompletedGalleryItem(
  item: GalleryJobItem,
  jobSubfolder: string,
  skipExisting: boolean,
  previous: PreviousItem | undefined,
  lookup: (subfolder: string, displayName: string) => Promise<CompletedItem | null>,
): Promise<CompletedItem | null> {
  const displayName = item.kind === "resolve-viewer" ? item.viewerUrl : item.imageUrl;
  if (previous?.status === "done" && previous.displayName === displayName) return previous;
  if (!skipExisting) return null;
  return lookup(item.subfolder ?? jobSubfolder, displayName);
}
