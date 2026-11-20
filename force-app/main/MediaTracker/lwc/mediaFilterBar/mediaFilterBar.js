import { LightningElement, api } from "lwc";
import { debounce, defaultDirectionFor } from "c/mediaTrackerUtils";

const ALL = "__all__";

/**
 * Stateless filter/sort/view toolbar. The parent owns the filter object and
 * passes it back down; this component only emits changes:
 *   filterchange -> detail: partial filter, e.g. { mediaType: 'Anime' }
 *   viewchange   -> detail: { view: 'grid' | 'list' }
 */
export default class MediaFilterBar extends LightningElement {
  @api typeOptions = [];
  @api statusOptions = [];
  @api sortOptions = [];
  @api filter = {};
  @api view = "grid";

  emitSearch = debounce((searchTerm) => this.notify({ searchTerm }), 300);

  get showTypeFilter() {
    return (this.typeOptions || []).length > 1;
  }

  get typeComboOptions() {
    return [{ label: "All types", value: ALL }, ...(this.typeOptions || [])];
  }

  get statusComboOptions() {
    return [
      { label: "All statuses", value: ALL },
      ...(this.statusOptions || [])
    ];
  }

  get typeValue() {
    return this.filter?.mediaType || ALL;
  }

  get statusValue() {
    return this.filter?.status || ALL;
  }

  get favoritesOnly() {
    return this.filter?.favoritesOnly === true;
  }

  get directionIcon() {
    return this.filter?.sortDirection === "ASC"
      ? "utility:arrowup"
      : "utility:arrowdown";
  }

  get directionLabel() {
    return this.filter?.sortDirection === "ASC" ? "Ascending" : "Descending";
  }

  get gridVariant() {
    return this.view === "list" ? "border" : "brand";
  }

  get listVariant() {
    return this.view === "list" ? "brand" : "border";
  }

  handleSearch(event) {
    this.emitSearch(event.target.value);
  }

  handleType(event) {
    this.notify({ mediaType: fromCombo(event.detail.value) });
  }

  handleStatus(event) {
    this.notify({ status: fromCombo(event.detail.value) });
  }

  handleSort(event) {
    const sortBy = event.detail.value;
    this.notify({ sortBy, sortDirection: defaultDirectionFor(sortBy) });
  }

  toggleDirection() {
    this.notify({
      sortDirection: this.filter?.sortDirection === "ASC" ? "DESC" : "ASC"
    });
  }

  toggleFavorites() {
    this.notify({ favoritesOnly: !this.favoritesOnly });
  }

  showGrid() {
    this.dispatchEvent(
      new CustomEvent("viewchange", { detail: { view: "grid" } })
    );
  }

  showList() {
    this.dispatchEvent(
      new CustomEvent("viewchange", { detail: { view: "list" } })
    );
  }

  notify(change) {
    this.dispatchEvent(new CustomEvent("filterchange", { detail: change }));
  }
}

function fromCombo(value) {
  return value === ALL ? "" : value;
}
