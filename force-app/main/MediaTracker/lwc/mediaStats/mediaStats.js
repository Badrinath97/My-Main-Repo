import { LightningElement, api } from "lwc";
import { statusKey } from "c/mediaTrackerUtils";

/**
 * Summary tiles for a MediaStatsData object.
 * Clicking a status tile emits statusselect -> detail: { status } ('' = all).
 */
export default class MediaStats extends LightningElement {
  @api stats;
  /** Currently selected status filter, used to highlight a tile. */
  @api activeStatus = "";

  get hasStats() {
    return Boolean(this.stats);
  }

  get tiles() {
    const s = this.stats;
    const tile = (key, label, value, status) => ({
      key,
      label,
      value,
      status,
      className: `tile tile_${status ? statusKey(status) : "total"}${
        status === this.activeStatus ? " tile_active" : ""
      }`
    });
    return [
      tile("total", "Total", s.total, ""),
      ...(s.byStatus || []).map((b) =>
        tile(`status-${b.value}`, b.label, b.count, b.value)
      )
    ];
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
}
