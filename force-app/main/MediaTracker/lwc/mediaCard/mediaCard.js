import { LightningElement, api } from "lwc";
import { customSeasonName, statusBadgeClass } from "c/mediaTrackerUtils";

const FALLBACK_ICON = "utility:open_folder";

/**
 * Presentational card for one media item. Holds no data logic - it only
 * renders the item and raises intent events for the parent to handle:
 *   edit | delete | favorite  -> detail: { id }
 *   progress                  -> detail: { id, step }
 *   collectionselect          -> detail: { id, collectionId }
 */
export default class MediaCard extends LightningElement {
  @api item;
  /** MediaTypeConfigData for item.mediaType (icon, progress unit, ...). */
  @api typeConfig;
  /** 'grid' | 'list' */
  @api variant = "grid";

  posterFailed = false;

  get containerClass() {
    return `card card_${this.variant === "list" ? "list" : "grid"}`;
  }

  get showPoster() {
    return Boolean(this.item?.posterUrl) && !this.posterFailed;
  }

  get iconName() {
    return this.typeConfig?.iconName || FALLBACK_ICON;
  }

  get typeLabel() {
    return this.typeConfig?.label || this.item?.mediaType;
  }

  get subtitle() {
    const { releaseYear, language, platform, genre } = this.item || {};
    return [releaseYear, language, platform, genre].filter(Boolean).join(" · ");
  }

  get hasCollection() {
    return Boolean(this.item?.collectionId && this.item?.collectionName);
  }

  /** e.g. "Infinity Saga #3" */
  get collectionLabel() {
    const order = this.item.collectionOrder;
    return order !== null && order !== undefined
      ? `${this.item.collectionName} #${order}`
      : this.item.collectionName;
  }

  get collectionTitle() {
    return `Show everything in ${this.item.collectionName}`;
  }

  get statusClass() {
    return statusBadgeClass(this.item?.status);
  }

  get hasRating() {
    return this.item?.rating !== null && this.item?.rating !== undefined;
  }

  get ratingLabel() {
    return `${this.item.rating}/10`;
  }

  get tracksProgress() {
    return this.typeConfig?.tracksProgress === true;
  }

  get hasSeasons() {
    return (
      this.typeConfig?.tracksSeasons === true &&
      (this.item?.seasons || []).length > 0
    );
  }

  /** e.g. "Season 2 · 3 / 8 · 3 seasons", or "Season 2: Shippuden · 3 / 8 · 3 seasons" */
  get seasonLabel() {
    const seasons = this.item.seasons;
    const current =
      seasons.find((s) => s.seasonNumber === this.item.currentSeasonNumber) ||
      seasons[seasons.length - 1];
    const episodes =
      current.episodeCount !== null && current.episodeCount !== undefined
        ? `${current.episodesWatched} / ${current.episodeCount}`
        : `${current.episodesWatched} watched`;
    const total = seasons.length > 1 ? ` · ${seasons.length} seasons` : "";
    const name = customSeasonName(current);
    const season = name
      ? `Season ${current.seasonNumber}: ${name}`
      : `Season ${current.seasonNumber}`;
    return `${season} · ${episodes}${total}`;
  }

  get hasMovies() {
    return (
      this.typeConfig?.tracksMovies === true &&
      (this.item?.movies || []).length > 0
    );
  }

  /** e.g. "Movies · 1 / 3 watched" */
  get movieLabel() {
    const movies = this.item.movies;
    const watched = movies.filter((m) => m.isComplete).length;
    return `Movies · ${watched} / ${movies.length} watched`;
  }

  get movieTitles() {
    return this.item.movies
      .map((m) => `${m.isComplete ? "✓" : "○"} ${m.name}`)
      .join("\n");
  }

  get progressValue() {
    return this.item?.progressPercent || 0;
  }

  get progressLabel() {
    const current = this.item?.progressCurrent || 0;
    const total = this.item?.progressTotal;
    const unit = this.typeConfig?.progressUnit || "";
    const amount = total ? `${current} / ${total}` : `${current}`;
    return `${amount} ${unit}`.trim();
  }

  get decrementDisabled() {
    return !this.item?.progressCurrent;
  }

  get incrementDisabled() {
    const total = this.item?.progressTotal;
    return Boolean(total) && (this.item?.progressCurrent || 0) >= total;
  }

  handlePosterError() {
    this.posterFailed = true;
  }

  handleFavorite() {
    this.fire("favorite");
  }

  handleMenuSelect(event) {
    this.fire(event.detail.value); // 'edit' | 'delete'
  }

  handleCollection() {
    this.fire("collectionselect", { collectionId: this.item.collectionId });
  }

  handleIncrement() {
    this.fire("progress", { step: 1 });
  }

  handleDecrement() {
    this.fire("progress", { step: -1 });
  }

  fire(name, extra = {}) {
    this.dispatchEvent(
      new CustomEvent(name, { detail: { id: this.item.id, ...extra } })
    );
  }
}
