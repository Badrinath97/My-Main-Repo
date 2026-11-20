/**
 * Shared constants and helpers for the Media Tracker components.
 * Import with: import { ... } from 'c/mediaTrackerUtils';
 */

export const STATUS = Object.freeze({
  PLANNED: "Planned",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  DROPPED: "Dropped"
});

const STATUS_BADGE_THEME = {
  [STATUS.IN_PROGRESS]: "slds-badge slds-badge_inverse",
  [STATUS.ON_HOLD]: "slds-badge slds-theme_warning",
  [STATUS.COMPLETED]: "slds-badge slds-theme_success",
  [STATUS.DROPPED]: "slds-badge slds-theme_error"
};

/** Keys must match MediaItemSelector.SORTABLE_FIELDS. */
export const SORT_OPTIONS = Object.freeze([
  { label: "Recently updated", value: "lastModified" },
  { label: "Title", value: "title" },
  { label: "Rating", value: "rating" },
  { label: "Release year", value: "releaseYear" },
  { label: "Progress", value: "progress" },
  { label: "Media type", value: "mediaType" },
  { label: "Status", value: "status" },
  { label: "Collection order", value: "collectionOrder" }
]);

/** Sort keys that read naturally A→Z / low→high; everything else defaults to descending. */
const ASCENDING_BY_DEFAULT = new Set([
  "title",
  "mediaType",
  "status",
  "collectionOrder"
]);

export function defaultDirectionFor(sortBy) {
  return ASCENDING_BY_DEFAULT.has(sortBy) ? "ASC" : "DESC";
}

/** MediaCollectionData[] (tree order) -> combobox options labelled with the full path. */
export function collectionOptions(collections) {
  return (collections || []).map((c) => ({
    label: c.path || c.name,
    value: c.id
  }));
}

/**
 * Ids of a collection and everything nested below it. Used to stop a
 * collection from being moved inside itself.
 */
export function collectionWithDescendants(collections, rootId) {
  const result = new Set();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.pop();
    if (id && !result.has(id)) {
      result.add(id);
      (collections || [])
        .filter((c) => c.parentId === id)
        .forEach((c) => queue.push(c.id));
    }
  }
  return result;
}

/**
 * A season's own name, e.g. "Shippuden", or "" when it only has the automatic
 * "Season N" name that Apex fills in when no name is given.
 */
export function customSeasonName(season) {
  const name = (season?.name || "").trim();
  return name === `Season ${season?.seasonNumber}` ? "" : name;
}

export function statusBadgeClass(status) {
  return STATUS_BADGE_THEME[status] || "slds-badge";
}

/** "Anime, Movie , " -> ['Anime', 'Movie'] */
export function parseList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return (value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Turns LDS / Apex / JS errors into a single readable message. */
export function reduceErrors(errors) {
  const list = Array.isArray(errors) ? errors : [errors];
  return list
    .filter(Boolean)
    .map((error) => {
      if (Array.isArray(error.body)) {
        return error.body.map((e) => e.message).join(", ");
      }
      if (error.body?.pageErrors?.length) {
        return error.body.pageErrors.map((e) => e.message).join(", ");
      }
      if (error.body?.fieldErrors) {
        const fieldMessages = Object.values(error.body.fieldErrors)
          .flat()
          .map((e) => e.message);
        if (fieldMessages.length) {
          return fieldMessages.join(", ");
        }
      }
      if (typeof error.body?.message === "string") {
        return error.body.message;
      }
      if (typeof error.message === "string") {
        return error.message;
      }
      return error.statusText || "Unknown error";
    })
    .join(", ");
}
