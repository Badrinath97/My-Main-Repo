/**
 * Shared constants and helpers for the Media Tracker components.
 * Import with: import { ... } from 'c/mediaTrackerUtils';
 */

import LOCALE from "@salesforce/i18n/locale";

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

const STATUS_KEYS = {
  [STATUS.PLANNED]: "planned",
  [STATUS.IN_PROGRESS]: "progress",
  [STATUS.ON_HOLD]: "hold",
  [STATUS.COMPLETED]: "completed",
  [STATUS.DROPPED]: "dropped"
};

/** CSS-friendly key for a status: 'planned' | 'progress' | 'hold' | 'completed' | 'dropped' | 'other'. */
export function statusKey(status) {
  return STATUS_KEYS[status] || "other";
}

/** Status pill classes; colours live in each component's CSS (.pill_<key>). */
export function statusPillClass(status) {
  return `pill pill_${statusKey(status)}`;
}

const POSTER_THEMES = 6;

/** Stable 0..5 theme index for a poster placeholder, so each title keeps its colour. */
export function posterTheme(seed) {
  let hash = 0;
  for (const ch of String(seed || "")) {
    hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  }
  return hash % POSTER_THEMES;
}

/**
 * "2002-10-03" -> "Oct 3, 2002", in the user's Salesforce locale
 * (e.g. "3 Oct 2002" for en_IN). Date-only values are read as UTC.
 */
export function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
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
