import { sanitizeFilename } from "../../background/sanitize";
import { buildSubfolder } from "../../content/shared/collector";
import type { MDConfig } from "../../types/global";

// Version pills use blue for the selected version and gray for the others.
// `mantine-active` means click feedback, and Loaded dots can occur on several
// versions, so neither identifies the selection. Avoid Mantine's hashed classes.
export function readSelectedModelVariant(doc: Document = document): string | null {
  const names = new Set<string>();
  for (const group of doc.querySelectorAll(".mantine-Group-root")) {
    const pills = Array.from(
      group.querySelectorAll<HTMLButtonElement>(
        ':scope > .mantine-Group-root > button[data-variant="filled"][data-size="compact-sm"]',
      ),
    );
    if (!pills.length) continue;
    const colors = pills.map((pill) => pill.style.getPropertyValue("--button-bg").trim());
    if (
      colors.some(
        (color) =>
          !["var(--mantine-color-blue-filled)", "var(--mantine-color-gray-filled)"].includes(color),
      )
    )
      continue;
    const selected = pills.filter(
      (_, index) => colors[index] === "var(--mantine-color-blue-filled)",
    );
    if (selected.length !== 1) continue;
    const label = selected[0]
      ?.querySelector(".mantine-Button-label")
      ?.textContent?.replace(/\s+/g, " ")
      .trim();
    // A lone compact action button is not enough evidence of a version picker.
    if (!label || (pills.length === 1 && !/^v\d/i.test(label))) continue;
    names.add(label);
  }
  // Ambiguous selectors should preserve the existing carousel-ID fallback.
  return names.size === 1 ? ([...names][0] ?? null) : null;
}

export function carouselSubfolder(
  fallbackName: string,
  variantName: string | null,
  itemCount: number,
  config: MDConfig,
): string {
  if (itemCount === 1 && (config.skipFolderWhenSingleImage ?? true)) return "";
  const name =
    (config.useModelVariantAsGalleryName ?? true) && variantName?.trim()
      ? sanitizeFilename(variantName)
      : fallbackName;
  return buildSubfolder(name, config);
}
