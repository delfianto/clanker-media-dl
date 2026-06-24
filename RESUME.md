# RESUME.md — Download History Tracking & Management Plan

This document details the analysis and implementation plan for utilizing the download history as a tracking/skip mechanism for gallery downloads, enabling individual job deletion, and requiring a confirmation dialog for clearing all history.

---

## 1. Analysis

### 1.1 Existing Behavior
- **Download History Storage**: Gallery jobs are persisted in `chrome.storage.local` under the key `"downloadJobs"`. A maximum of 50 completed/errored jobs are kept to avoid unbounded growth.
- **Interrupted Jobs**: When the background Service Worker restarts (e.g. Chrome restarts or extension reloads), the function `resumeRunningJobs()` marks any remaining `"running"` jobs as `"error"`.
- **Duplicate Downloads**: When a user initiates a download (via `MD_GALLERY_START`), it launches a fresh job with a new `jobId`. Even if some files were successfully downloaded in a previous attempt, the system starts downloading all of them again.
- **Nuking History**: The options page only has a single "Clear" button (`#btn-clear-history`) which instantly resets the `"downloadJobs"` array to `[]` without asking for user permission.
- **Individual Deletion**: There is currently no way to remove single download jobs from the list.

### 1.2 Proposed Tracking & Skip Mechanism
To prevent repeating successfully completed downloads when a gallery job is restarted or retried:
1. When starting a job (`startGalleryJob`), we read the existing download jobs from storage.
2. For each incoming `GalleryJobItem` (identified by its `viewerUrl` or direct `imageUrl` stored as its `displayName`, and the target `subfolder`), we check if a job in the history contains a matching item with status `"done"`.
3. If a match is found:
   - We mark the item's initial status in the new job as `"done"` immediately.
   - We set its `filename` to the already completed historical item's filename.
   - We increment the new job's initial `completedCount` accordingly.
   - In `runQueue`, we skip any items that have the status `"done"`.
   - This ensures that only pending or previously failed items are resolved and downloaded, saving bandwidth and avoiding rate-limiting.

### 1.3 Individual Deletion
1. Introduce a new message type `MD_DELETE_JOB` carrying the `jobId` to be deleted.
2. Implement a `deleteJob(jobId)` helper in the SW to filter the jobs array and update storage.
3. Update the Options page UI:
   - Add a container `.job-header-right` inside the job card header.
   - Place a delete button (`×` / class `.job-delete-btn`) next to the job status.
   - Attach a click listener with `event.stopPropagation()` to dispatch the `MD_DELETE_JOB` message and refresh the list without triggering card expansion.

### 1.4 Clear All Confirmation
- Modify the event listener for `#btn-clear-history` to prompt the user using `confirm("Clear all download history?")` before purging the storage.

---

## 2. Implementation Plan

### Step 1: Types & Messages
- Modify [src/types/messages.d.ts](file:///srv/project/personal/clanker-media-dl/src/types/messages.d.ts) to define the new request type:
  ```typescript
  export type MDDeleteJobRequest = {
    type: "MD_DELETE_JOB";
    jobId: string;
  };
  ```

### Step 2: Background Sw Logic
- Modify [src/background/gallery.ts](file:///srv/project/personal/clanker-media-dl/src/background/gallery.ts):
  - Add and export `deleteJob(jobId: string): Promise<void>`.
  - In `startGalleryJob(req)`:
    - Load historical jobs.
    - Check if each gallery item matches a completed item in history (`displayName === itemUrl` and `status === "done"` under the same `subfolder`).
    - Pre-mark them as `"done"`, set filename, and update initial `completedCount`.
  - In `runQueue`:
    - Skip processing if `job.items?.[idx]?.status === "done"`.
- Modify [src/background/index.ts](file:///srv/project/personal/clanker-media-dl/src/background/index.ts):
  - Import `deleteJob`.
  - Handle message type `"MD_DELETE_JOB"`.

### Step 3: Options UI and Styling
- Modify [src/options/index.ts](file:///srv/project/personal/clanker-media-dl/src/options/index.ts):
  - Update `renderJobCard(job)`:
    - Wrap status and a new delete button in a container `job-header-right`.
    - Hook click event on the delete button to send `"MD_DELETE_JOB"` and reload the history tab.
  - Update `btn-clear-history` click listener:
    - Wrap the purge logic in `if (!confirm("Clear all download history?")) return;`.
- Modify [src/options/styles.css](file:///srv/project/personal/clanker-media-dl/src/options/styles.css):
  - Add styles for `.job-header-right` and `.job-delete-btn` (with hover effects, matching colors).
