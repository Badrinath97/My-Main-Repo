import { LightningElement, api } from "lwc";
import {
  customSeasonName,
  formatDate,
  posterTheme,
  statusKey,
  statusPillClass
} from "c/mediaTrackerUtils";

const FALLBACK_ICON = "utility:open_folder";

/** Only real web links become clickable (never javascript: or data: URLs). */
function safeWebUrl(value) {
  const url = (value || "").trim();
  return /^https?:\/\/\S+$/i.test(url) ? url : null;
}

/** "https://www.fitgirl-repacks.site/x" -> "fitgirl-repacks.site" */
function hostOf(url) {
  const match = /^https?:\/\/(?:www\.)?([^/?#:]+)/i.exec(url);
  return match ? match[1] : url;
}

/**
 * Read-only details of one media item: poster banner, key facts, overall
 * progress, seasons and related movies. Presentational only; it is shown
 * inside c-media-item-detail-modal.
 *
 * Fields hidden for the item's type in the form (Hidden_Form_Fields__c) are
 * hidden here too, so each type looks the same in both places.
 */
export default class MediaItemDetail extends LightningElement {
  @api item;
  /** MediaTypeConfigData for item.mediaType. */
  @api typeConfig;

  posterFailed = false;

  get hidden() {
    return new Set(this.typeConfig?.hiddenFields || []);
  }

  isVisible(field) {
    return !this.hidden.has(field);
  }

  // ------------------------------------------------------------- hero

  get showPoster() {
    return Boolean(this.item?.posterUrl) && !this.posterFailed;
  }

  get placeholderClass() {
    return `poster poster_placeholder theme_${posterTheme(this.item?.title)}`;
  }

  /** Blurred copy of the poster behind the header. */
  get backdropStyle() {
    return this.showPoster
      ? `background-image: url(${JSON.stringify(this.item.posterUrl)})`
      : "";
  }

  get backdropClass() {
    return this.showPoster
      ? "backdrop"
      : `backdrop theme_${posterTheme(this.item?.title)}`;
  }

  get iconName() {
    return this.typeConfig?.iconName || FALLBACK_ICON;
  }

  get typeLabel() {
    return this.typeConfig?.label || this.item?.mediaType;
  }

  get statusClass() {
    return statusPillClass(this.item?.status);
  }

  get hasRating() {
    return (
      this.isVisible("rating") &&
      this.item?.rating !== null &&
      this.item?.rating !== undefined
    );
  }

  get ratingLabel() {
    return `${this.item.rating}/10`;
  }

  /** Five stars, filled by rating (0-10 scale). */
  get stars() {
    const filled = Math.round((this.item?.rating || 0) / 2);
    return [1, 2, 3, 4, 5].map((n) => ({
      key: `star-${n}`,
      className: n <= filled ? "star star_on" : "star"
    }));
  }

  get tagline() {
    const { language, genre } = this.item || {};
    return [
      this.typeLabel,
      this.isVisible("language") ? language : null,
      this.isVisible("genre") ? genre : null
    ]
      .filter(Boolean)
      .join(" · ");
  }

  // ------------------------------------------------------------ facts

  /** Label/value pairs, skipping empty and hidden ones. */
  get facts() {
    const i = this.item || {};
    const collection = i.collectionName
      ? `${i.collectionName}${i.collectionOrder !== null && i.collectionOrder !== undefined ? ` #${i.collectionOrder}` : ""}`
      : null;
    return [
      ["releaseYear", "Release year", i.releaseYear],
      ["platform", "Platform", this.platformText],
      ["language", "Language", i.language],
      ["genre", "Genre", i.genre],
      ["airedDate", "Aired", formatDate(i.airedDate)],
      ["startDate", "Started", formatDate(i.startDate)],
      ["completedDate", "Completed", formatDate(i.completedDate)],
      ["collection", "Collection", collection]
    ]
      .filter(([field, , value]) => this.isVisible(field) && value)
      .map(([field, label, value]) => ({
        key: field,
        label,
        value,
        href: field === "platform" ? this.platformUrl : null
      }));
  }

  /** The platform link, when one is set, it is a web link and the type shows it. */
  get platformUrl() {
    return this.isVisible("platformUrl")
      ? safeWebUrl(this.item?.platformUrl)
      : null;
  }

  /** Platform name, or the link's site name when only a link was given. */
  get platformText() {
    const url = this.platformUrl;
    return this.item?.platform || (url ? hostOf(url) : null);
  }

  get hasFacts() {
    return this.facts.length > 0;
  }

  // --------------------------------------------------------- progress

  get tracksProgress() {
    return this.typeConfig?.tracksProgress === true;
  }

  get progressPercent() {
    return this.item?.progressPercent || 0;
  }

  get progressFillClass() {
    return `fill fill_${statusKey(this.item?.status)}`;
  }

  get progressFillStyle() {
    return `width: ${this.progressPercent}%`;
  }

  get progressLabel() {
    const current = this.item?.progressCurrent || 0;
    const total = this.item?.progressTotal;
    const unit = this.typeConfig?.progressUnit || "";
    const amount = total ? `${current} / ${total}` : `${current}`;
    return `${amount} ${unit}`.trim();
  }

  // ---------------------------------------------------------- seasons

  get showSeasons() {
    return (
      this.typeConfig?.tracksSeasons === true &&
      (this.item?.seasons || []).length > 0
    );
  }

  get showSeasonAired() {
    return this.isVisible("seasonAiredDate");
  }

  get showSeasonCompleted() {
    return this.isVisible("seasonCompletedDate");
  }

  get seasonTableClass() {
    const dates =
      (this.showSeasonAired ? 1 : 0) + (this.showSeasonCompleted ? 1 : 0);
    return `table table_dates${dates}`;
  }

  get seasonCountLabel() {
    const n = (this.item?.seasons || []).length;
    return `${n} season${n === 1 ? "" : "s"}`;
  }

  get seasonRows() {
    return (this.item?.seasons || []).map((s) => {
      const known = s.episodeCount !== null && s.episodeCount !== undefined;
      const percent =
        known && s.episodeCount > 0
          ? Math.min(
              100,
              Math.round((s.episodesWatched / s.episodeCount) * 100)
            )
          : 0;
      const isCurrent = s.seasonNumber === this.item.currentSeasonNumber;
      return {
        key: s.id || `season-${s.seasonNumber}`,
        number: s.seasonNumber,
        name: customSeasonName(s) || `Season ${s.seasonNumber}`,
        episodes: known
          ? `${s.episodesWatched} / ${s.episodeCount}`
          : `${s.episodesWatched} (airing)`,
        fillStyle: `width: ${percent}%`,
        fillClass: s.isComplete ? "fill fill_completed" : "fill fill_progress",
        aired: formatDate(s.airedDate) || "—",
        completed: formatDate(s.completedDate) || (known ? "—" : "Airing"),
        rowClass: isCurrent && !s.isComplete ? "row row_current" : "row",
        isComplete: s.isComplete === true,
        isCurrent: isCurrent && !s.isComplete
      };
    });
  }

  // ----------------------------------------------------------- movies

  get showMovies() {
    return (
      this.typeConfig?.tracksMovies === true &&
      (this.item?.movies || []).length > 0
    );
  }

  get showMovieAired() {
    return this.isVisible("movieAiredDate");
  }

  get movieSummary() {
    const movies = this.item?.movies || [];
    const watched = movies.filter((m) => m.isComplete).length;
    return `${watched} of ${movies.length} watched`;
  }

  get movieRows() {
    return (this.item?.movies || []).map((m, index) => ({
      key: m.id || `movie-${index}`,
      name: m.name,
      aired: formatDate(m.airedDate),
      watched: m.isComplete === true,
      iconName: m.isComplete ? "utility:success" : "utility:routing_offline",
      iconVariant: m.isComplete ? "success" : "",
      iconLabel: m.isComplete ? "Watched" : "Not watched yet"
    }));
  }

  // ------------------------------------------------------------ notes

  get showNotes() {
    return this.isVisible("notes") && Boolean(this.item?.notes);
  }

  handlePosterError() {
    this.posterFailed = true;
  }
}
