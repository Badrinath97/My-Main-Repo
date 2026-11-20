import { LightningElement, api } from "lwc";
import { debounce, defaultDirectionFor } from "c/mediaTrackerUtils";

const ALL = "__all__";

/**
 * Stateless filter/sort/view toolbar. The parent owns the filter object and
 * passes it back down; this component only emits changes:
 *   filterchange -> detail: partial filter, e.g. { mediaType: 'Anime' }
 *   viewchange   -> detail: { view: 'grid' | 'list' | 'collections' }
 */
export default class MediaFilterBar extends LightningElement {
  @api typeOptions = [];
  @api statusOptions = [];
  @api sortOptions = [];
  @api filter = {};
  /** [{ label, value }] for Language__c. The filter is hidden when empty. */
  @api languageOptions = [];
  /** [{ label, value }] of collections (labelled with their full path). Hidden when empty. */
  @api collectionOptions = [];
  /** 'grid' | 'list' | 'collections' */
  @api view = "grid";

  emitSearch = debounce((searchTerm) => this.notify({ searchTerm }), 300);

  get showTypeFilter() {
    return (this.typeOptions || []).length > 1;
  }

  get showLanguageFilter() {
    return (this.languageOptions || []).length > 0;
  }

  get showCollectionFilter() {
    return (this.collectionOptions || []).length > 0;
  }

  get languageComboOptions() {
    return [
      { label: "All languages", value: ALL },
      ...(this.languageOptions || [])
    ];
  }

  get collectionComboOptions() {
    return [
      { label: "All collections", value: ALL },
      ...(this.collectionOptions || [])
    ];
  }

  get languageValue() {
    return this.filter?.language || ALL;
  }

  get collectionValue() {
    return this.filter?.collectionId || ALL;
  }

  get isGrid() {
    return this.view === "grid" || !this.view;
  }

  get gridClass() {
    return glossClass(this.isGrid);
  }

  get gridPressed() {
    return String(this.isGrid);
  }

  get listClass() {
    return glossClass(this.view === "list");
  }

  get listPressed() {
    return String(this.view === "list");
  }

  get collectionsClass() {
    return glossClass(this.view === "collections");
  }

  get collectionsPressed() {
    return String(this.view === "collections");
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

  get favoritesClass() {
    return `gloss gloss_fav${this.favoritesOnly ? " gloss_on" : ""}`;
  }

  get favoritesPressed() {
    return String(this.favoritesOnly);
  }

  get directionIcon() {
    return this.filter?.sortDirection === "ASC"
      ? "utility:arrowup"
      : "utility:arrowdown";
  }

  get directionLabel() {
    return this.filter?.sortDirection === "ASC" ? "Ascending" : "Descending";
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

  handleLanguage(event) {
    this.notify({ language: fromCombo(event.detail.value) });
  }

  handleCollection(event) {
    const collectionId = fromCombo(event.detail.value);
    // Picking a collection shows it in order; clearing keeps the current sort.
    this.notify(
      collectionId
        ? { collectionId, sortBy: "collectionOrder", sortDirection: "ASC" }
        : { collectionId }
    );
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
    this.changeView("grid");
  }

  showList() {
    this.changeView("list");
  }

  showCollections() {
    this.changeView("collections");
  }

  changeView(view) {
    this.dispatchEvent(new CustomEvent("viewchange", { detail: { view } }));
  }

  notify(change) {
    this.dispatchEvent(new CustomEvent("filterchange", { detail: change }));
  }
}

function glossClass(selected) {
  return selected ? "gloss gloss_on" : "gloss";
}

function fromCombo(value) {
  return value === ALL ? "" : value;
}
