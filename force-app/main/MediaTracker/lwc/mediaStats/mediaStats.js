import { LightningElement, api } from "lwc";
import { statusKey } from "c/mediaTrackerUtils";

/**
 * Summary tiles for a MediaStatsData object. The status tiles and the
 * Favorites tile work as one group of quick filters:
 *   statusselect    -> detail: { status }         ('' = all, from Total)
 *   favoritesselect -> detail: { favoritesOnly }  (toggles)
 */
export default class MediaStats extends LightningElement {
  @api stats;
  /** Currently selected status filter, used to highlight a tile. */
  @api activeStatus = "";
  /** True while only favorites are shown, used to highlight the Favorites tile. */
  @api favoritesOnly = false;

  get hasStats() {
    return Boolean(this.stats);
  }

  get tiles() {
    const s = this.stats;
    const active = this.activeStatus || "";
    const tile = (key, label, value, status) => {
      // Total is only "selected" when no other quick filter is.
      const isActive = status
        ? status === active
        : !active && !this.favoritesOnly;
      return {
        key,
        label,
        value,
        status,
        pressed: String(isActive),
        className: `tile glass tile_${status ? statusKey(status) : "total"}${
          isActive ? " tile_active" : ""
        }`
      };
    };
    return [
      tile("total", "Total", s.total, ""),
      ...(s.byStatus || []).map((b) =>
        tile(`status-${b.value}`, b.label, b.count, b.value)
      )
    ];
  }

  get favoritesClass() {
    return `tile glass tile_favorites${this.favoritesOnly ? " tile_active" : ""}`;
  }

  get favoritesPressed() {
    return String(this.favoritesOnly === true);
  }

  get averageRating() {
    return this.stats?.averageRating ?? "–";
  }

  get typeBreakdown() {
    return (this.stats?.byType || []).map((b) => ({
      key: b.value,
      label: `${b.label} · ${b.count}`
    }));
  }

  handleTileClick(event) {
    const status = event.currentTarget.dataset.status;
    const next = status === this.activeStatus ? "" : status;
    this.dispatchEvent(
      new CustomEvent("statusselect", { detail: { status: next } })
    );
  }

  handleFavoritesClick() {
    this.dispatchEvent(
      new CustomEvent("favoritesselect", {
        detail: { favoritesOnly: !this.favoritesOnly }
      })
    );
  }
}
