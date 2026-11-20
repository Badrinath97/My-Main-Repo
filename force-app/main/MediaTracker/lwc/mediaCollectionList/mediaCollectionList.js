import { LightningElement, api } from "lwc";

/**
 * Presentational list of collections (franchises, universes, series), shown
 * as a tree: sub-collections are indented under their parent. Raises intent
 * events only; the container does the work:
 *   select | edit | delete -> detail: { id }
 *   new                    -> no detail
 */
export default class MediaCollectionList extends LightningElement {
  /** MediaCollectionData[] in tree order (as returned by Apex). */
  @api collections = [];
  /** [{ label, value }] for Collection_Type__c, used for display labels. */
  @api typeOptions = [];
  @api activeCollectionId;

  get hasCollections() {
    return (this.collections || []).length > 0;
  }

  get rows() {
    const typeLabels = Object.fromEntries(
      (this.typeOptions || []).map((o) => [o.value, o.label])
    );
    return (this.collections || []).map((c) => {
      const percent = c.itemCount
        ? Math.round((c.completedCount / c.itemCount) * 100)
        : 0;
      return {
        ...c,
        typeLabel: typeLabels[c.collectionType] || c.collectionType,
        countLabel: `${c.completedCount} of ${c.itemCount} completed`,
        percent,
        rowClass: c.id === this.activeCollectionId ? "row row_active" : "row",
        // Indent sub-collections so the hierarchy is visible.
        rowStyle: `padding-left: ${0.75 + (c.depth || 0) * 1.5}rem`,
        iconName: c.depth ? "utility:level_down" : "utility:layers"
      };
    });
  }

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
