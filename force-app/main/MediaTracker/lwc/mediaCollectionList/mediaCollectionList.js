import { LightningElement, api } from "lwc";
import { posterTheme } from "c/mediaTrackerUtils";

/**
 * Presentational list of collections (franchises, universes, series), shown
 * as a collapsible tree: sub-collections are indented under their parent and
 * hidden until the parent is expanded (everything starts collapsed). Raises
 * intent events only; the container does the work:
 *   select | edit | delete -> detail: { id }
 *   new                    -> no detail
 */
export default class MediaCollectionList extends LightningElement {
  /** MediaCollectionData[] in tree order (as returned by Apex). */
  @api collections = [];
  /** [{ label, value }] for Collection_Type__c, used for display labels. */
  @api typeOptions = [];
  @api activeCollectionId;

  /** Ids of expanded collections. Replaced (not mutated) so the view re-renders. */
  expandedIds = new Set();
  /** Ids whose poster failed to load; they show the placeholder instead. */
  failedPosterIds = new Set();

  get hasCollections() {
    return (this.collections || []).length > 0;
  }

  /** parentId -> number of direct sub-collections. */
  get childCounts() {
    const counts = {};
    (this.collections || []).forEach((c) => {
      if (c.parentId) {
        counts[c.parentId] = (counts[c.parentId] || 0) + 1;
      }
    });
    return counts;
  }

  get hasNesting() {
    return Object.keys(this.childCounts).length > 0;
  }

  /** A row shows only when every collection above it is expanded. */
  isShown(collection, byId) {
    let parentId = collection.parentId;
    const seen = new Set();
    while (parentId && byId[parentId] && !seen.has(parentId)) {
      if (!this.expandedIds.has(parentId)) {
        return false;
      }
      seen.add(parentId);
      parentId = byId[parentId].parentId;
    }
    return true;
  }

  get rows() {
    const all = this.collections || [];
    const byId = Object.fromEntries(all.map((c) => [c.id, c]));
    const childCounts = this.childCounts;
    const typeLabels = Object.fromEntries(
      (this.typeOptions || []).map((o) => [o.value, o.label])
    );
    return all
      .filter((c) => this.isShown(c, byId))
      .map((c) => {
        const percent = c.itemCount
          ? Math.round((c.completedCount / c.itemCount) * 100)
          : 0;
        const children = childCounts[c.id] || 0;
        const expanded = this.expandedIds.has(c.id);
        const name = c.name;
        return {
          ...c,
          typeLabel: typeLabels[c.collectionType] || c.collectionType,
          countLabel: `${c.completedCount} of ${c.itemCount} completed`,
          childLabel: children
            ? `${children} sub-collection${children === 1 ? "" : "s"}`
            : "",
          hasChildren: children > 0,
          expanded: String(expanded),
          toggleIcon: expanded ? "utility:chevrondown" : "utility:chevronright",
          toggleLabel: `${expanded ? "Collapse" : "Expand"} ${name}`,
          showPoster: Boolean(c.posterUrl) && !this.failedPosterIds.has(c.id),
          placeholderClass: `thumb thumb_placeholder theme_${posterTheme(name)}`,
          percent,
          fillStyle: `width: ${percent}%`,
          fillClass:
            percent === 100 ? "fill fill_completed" : "fill fill_progress",
          rowClass: c.id === this.activeCollectionId ? "row row_active" : "row",
          // Indent sub-collections so the hierarchy is visible.
          rowStyle: `padding-left: ${0.75 + (c.depth || 0) * 1.5}rem`
        };
      });
  }

  // ------------------------------------------------------ expand/collapse

  handleToggle(event) {
    const id = event.currentTarget.dataset.toggle;
    const next = new Set(this.expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedIds = next;
  }

  handleExpandAll() {
    this.expandedIds = new Set(Object.keys(this.childCounts));
  }

  handleCollapseAll() {
    this.expandedIds = new Set();
  }

  handlePosterError(event) {
    const next = new Set(this.failedPosterIds);
    next.add(event.currentTarget.dataset.id);
    this.failedPosterIds = next;
  }

  // ---------------------------------------------------------------- events

  handleSelect(event) {
    this.fire("select", event.currentTarget.dataset.id);
  }

  handleMenu(event) {
    this.fire(event.detail.value, event.currentTarget.dataset.id); // 'edit' | 'delete'
  }

  handleNew() {
    this.dispatchEvent(new CustomEvent("new"));
  }

  fire(name, id) {
    this.dispatchEvent(new CustomEvent(name, { detail: { id } }));
  }
}
