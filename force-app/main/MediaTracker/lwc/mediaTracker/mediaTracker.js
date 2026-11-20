import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import { getObjectInfo, getPicklistValues } from "lightning/uiObjectInfoApi";
import MEDIA_ITEM_OBJECT from "@salesforce/schema/Media_Item__c";
import MEDIA_COLLECTION_OBJECT from "@salesforce/schema/Media_Collection__c";
import STATUS_FIELD from "@salesforce/schema/Media_Item__c.Status__c";
import LANGUAGE_FIELD from "@salesforce/schema/Media_Item__c.Language__c";
import COLLECTION_TYPE_FIELD from "@salesforce/schema/Media_Collection__c.Collection_Type__c";
import getTypeConfigs from "@salesforce/apex/MediaTrackerController.getTypeConfigs";
import getMediaItems from "@salesforce/apex/MediaTrackerController.getMediaItems";
import getStats from "@salesforce/apex/MediaTrackerController.getStats";
import incrementProgress from "@salesforce/apex/MediaTrackerController.incrementProgress";
import toggleFavorite from "@salesforce/apex/MediaTrackerController.toggleFavorite";
import deleteMediaItem from "@salesforce/apex/MediaTrackerController.deleteMediaItem";
import getCollections from "@salesforce/apex/MediaTrackerController.getCollections";
import deleteCollection from "@salesforce/apex/MediaTrackerController.deleteCollection";
import MediaItemForm from "c/mediaItemForm";
import MediaCollectionForm from "c/mediaCollectionForm";
import MediaItemDetailModal from "c/mediaItemDetailModal";
import {
  SORT_OPTIONS,
  collectionOptions,
  defaultDirectionFor,
  parseList,
  reduceErrors
} from "c/mediaTrackerUtils";

const DEFAULT_PAGE_SIZE = 12;
const VIEWS = ["grid", "list", "collections"];

const toOptions = (data) =>
  data.values.map(({ label, value }) => ({ label, value }));

/**
 * Media Tracker container.
 *
 * Owns state and server calls; delegates rendering to child components:
 *   c-media-stats           summary tiles
 *   c-media-filter-bar      search / filter / sort / view toggle
 *   c-media-card            one item
 *   c-media-collection-list collections (franchises, universes) as a tree
 *   c-media-item-form       create / edit item modal
 *   c-media-collection-form create / edit collection modal
 *   c-media-item-detail-modal read-only details (poster, seasons, movies)
 *
 * Drop several instances on different pages with different settings,
 * e.g. an "Anime" tab restricted via mediaTypes="Anime".
 */
export default class MediaTracker extends NavigationMixin(LightningElement) {
  @api cardTitle = "My Media Tracker";
  /** Comma-separated Media_Type__c values this instance is limited to. Blank = all. */
  @api mediaTypes = "";
  /** 'grid' | 'list' | 'collections' */
  @api defaultView = "grid";
  @api defaultSort = "lastModified";
  @api pageSize = DEFAULT_PAGE_SIZE;
  @api hideStats = false;
  @api hideAddButton = false;

  items = [];
  totalCount = 0;
  hasMore = false;
  isLoading = false;
  error;
  stats;
  typeConfigs = [];
  statusOptions = [];
  languageOptions = [];
  collectionTypeOptions = [];
  collections = [];
  view = "grid";
  /** Last items view (grid/list), restored after picking a collection. */
  itemView = "grid";
  filter = {};
  sortOptions = SORT_OPTIONS;

  _requestId = 0;
  /** True while the next page is being appended (spinner at the bottom, not over the cards). */
  isAppending = false;
  /** Watches the marker after the last card; null where IntersectionObserver is unavailable. */
  _scrollObserver = null;
  _sentinel = null;

  connectedCallback() {
    this.startInfiniteScroll();
    this.view = VIEWS.includes(this.defaultView) ? this.defaultView : "grid";
    this.itemView = this.view === "list" ? "list" : "grid";
    const sortBy = this.defaultSort || "lastModified";
    this.filter = {
      searchTerm: "",
      mediaType: "",
      status: "",
      language: "",
      collectionId: "",
      favoritesOnly: false,
      sortBy,
      sortDirection: defaultDirectionFor(sortBy)
    };
    this.refresh();
  }

  renderedCallback() {
    // The marker is re-created whenever the list re-renders with more pages.
    const sentinel = this.template.querySelector('[data-id="scroll-sentinel"]');
    if (this._scrollObserver && sentinel !== this._sentinel) {
      if (this._sentinel) {
        this._scrollObserver.unobserve(this._sentinel);
      }
      this._sentinel = sentinel;
      if (sentinel) {
        this._scrollObserver.observe(sentinel);
      }
    }
  }

  disconnectedCallback() {
    if (this._scrollObserver) {
      this._scrollObserver.disconnect();
    }
    this._sentinel = null;
  }

  // ---------------------------------------------------- infinite scroll

  startInfiniteScroll() {
    if (this._scrollObserver || typeof IntersectionObserver !== "function") {
      return; // no support: the Load more button is shown instead
    }
    this._scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.loadNextPage();
        }
      },
      { rootMargin: "0px 0px 400px 0px" } // start loading just before the end is reached
    );
  }

  loadNextPage() {
    if (this.hasMore && !this.isLoading && !this.error) {
      this.loadItems(false);
    }
  }

  /**
   * The observer only fires when the marker enters the screen. On a tall
   * screen it can still be visible after a page loads, so check again.
   */
  recheckSentinel() {
    if (this._scrollObserver && this._sentinel) {
      this._scrollObserver.unobserve(this._sentinel);
      this._scrollObserver.observe(this._sentinel); // reports its current state
    }
  }

  // ------------------------------------------------------------- wires

  @wire(getTypeConfigs)
  wiredTypeConfigs({ data, error }) {
    if (data) {
      this.typeConfigs = data;
    } else if (error) {
      this.error = reduceErrors(error);
    }
  }

  @wire(getObjectInfo, { objectApiName: MEDIA_ITEM_OBJECT })
  objectInfo;

  @wire(getObjectInfo, { objectApiName: MEDIA_COLLECTION_OBJECT })
  collectionObjectInfo;

  @wire(getPicklistValues, {
    recordTypeId: "$objectInfo.data.defaultRecordTypeId",
    fieldApiName: STATUS_FIELD
  })
  wiredStatuses({ data }) {
    if (data) {
      this.statusOptions = toOptions(data);
    }
  }

  @wire(getPicklistValues, {
    recordTypeId: "$objectInfo.data.defaultRecordTypeId",
    fieldApiName: LANGUAGE_FIELD
  })
  wiredLanguages({ data }) {
    if (data) {
      this.languageOptions = toOptions(data);
    }
  }

  @wire(getPicklistValues, {
    recordTypeId: "$collectionObjectInfo.data.defaultRecordTypeId",
    fieldApiName: COLLECTION_TYPE_FIELD
  })
  wiredCollectionTypes({ data }) {
    if (data) {
      this.collectionTypeOptions = toOptions(data);
    }
  }

  // ---------------------------------------------------------- public API

  /** Reloads items, stats and collections. Callable by a parent component. */
  @api
  refresh() {
    this.loadItems(true);
    this.loadStats();
    this.loadCollections();
  }

  // ------------------------------------------------------------ getters

  get allowedTypes() {
    return parseList(this.mediaTypes);
  }

  get availableTypeConfigs() {
    const allowed = this.allowedTypes;
    return allowed.length
      ? this.typeConfigs.filter((c) => allowed.includes(c.value))
      : this.typeConfigs;
  }

  get typeOptions() {
    return this.availableTypeConfigs.map(({ label, value }) => ({
      label,
      value
    }));
  }

  get collectionFilterOptions() {
    return collectionOptions(this.collections);
  }

  get cards() {
    const configByType = Object.fromEntries(
      this.typeConfigs.map((c) => [c.value, c])
    );
    return this.items.map((item) => ({
      key: item.id,
      item,
      config: configByType[item.mediaType]
    }));
  }

  get isCollectionsView() {
    return this.view === "collections";
  }

  /** The cards use grid/list; the collections view has its own layout. */
  get cardVariant() {
    return this.view === "list" ? "list" : "grid";
  }

  get showStats() {
    return !this.hideStats;
  }

  get showAddButton() {
    return !this.hideAddButton;
  }

  get hasItems() {
    return this.items.length > 0;
  }

  get showFooter() {
    return this.hasItems && !this.isCollectionsView;
  }

  get showEmptyState() {
    return !this.isLoading && !this.error && this.items.length === 0;
  }

  get hasActiveFilters() {
    const f = this.filter;
    return Boolean(
      f.searchTerm ||
      f.mediaType ||
      f.status ||
      f.language ||
      f.collectionId ||
      f.favoritesOnly
    );
  }

  get emptyMessage() {
    return this.hasActiveFilters
      ? "Nothing matches these filters."
      : "Your list is empty. Add something you're watching, reading or playing!";
  }

  get listClass() {
    return this.view === "list" ? "items items_list" : "items items_grid";
  }

  /** Full overlay spinner only for a fresh load; appending shows a small one at the bottom. */
  get showSpinner() {
    return this.isLoading && !this.isAppending;
  }

  get showLoadMoreButton() {
    return !this._scrollObserver;
  }

  get footerText() {
    return `Showing ${this.items.length} of ${this.totalCount}`;
  }

  // -------------------------------------------------------------- data

  buildRequest(offset) {
    const f = this.filter;
    return {
      searchTerm: f.searchTerm,
      mediaTypes: f.mediaType ? [f.mediaType] : this.allowedTypes,
      statuses: f.status ? [f.status] : [],
      languages: f.language ? [f.language] : [],
      collectionIds: f.collectionId ? [f.collectionId] : [],
      includeSubCollections: true,
      favoritesOnly: f.favoritesOnly,
      sortBy: f.sortBy,
      sortDirection: f.sortDirection,
      pageSize: Number(this.pageSize) || DEFAULT_PAGE_SIZE,
      pageOffset: offset
    };
  }

  async loadItems(reset) {
    const requestId = ++this._requestId; // ignore responses from superseded requests
    this.isLoading = true;
    this.isAppending = !reset;
    let loaded = false;
    try {
      const page = await getMediaItems({
        filter: this.buildRequest(reset ? 0 : this.items.length)
      });
      if (requestId !== this._requestId) {
        return;
      }
      this.items = reset ? page.items : [...this.items, ...page.items];
      this.totalCount = page.totalCount;
      this.hasMore = page.hasMore;
      this.error = undefined;
      loaded = true;
    } catch (e) {
      if (requestId === this._requestId) {
        this.error = reduceErrors(e);
      }
    } finally {
      if (requestId === this._requestId) {
        this.isLoading = false;
        this.isAppending = false;
      }
    }
    if (loaded && this.hasMore) {
      // Wait for the new cards to render, then keep filling the screen if needed.
      Promise.resolve().then(() => this.recheckSentinel());
    }
  }

  async loadStats() {
    if (this.hideStats) {
      return;
    }
    try {
      this.stats = await getStats({ mediaTypes: this.allowedTypes });
    } catch {
      this.stats = undefined; // stats are non-critical; keep the list usable
    }
  }

  async loadCollections() {
    try {
      this.collections = (await getCollections()) || [];
    } catch {
      this.collections = []; // collections are optional; keep the list usable
    }
  }

  replaceItem(updated) {
    this.items = this.items.map((i) => (i.id === updated.id ? updated : i));
  }

  // ----------------------------------------------------------- handlers

  handleFilterChange(event) {
    this.filter = { ...this.filter, ...event.detail };
    this.loadItems(true);
  }

  handleStatusSelect(event) {
    this.filter = { ...this.filter, status: event.detail.status };
    this.loadItems(true);
  }

  handleViewChange(event) {
    this.view = event.detail.view;
    if (this.view !== "collections") {
      this.itemView = this.view;
    }
  }

  handleLoadMore() {
    this.loadItems(false);
  }

  handleAdd() {
    this.openForm();
  }

  /** Opens the details window; it can lead on to Edit or the record page. */
  async handleOpen(event) {
    const item = this.items.find((i) => i.id === event.detail.id);
    if (!item) {
      return;
    }
    const action = await MediaItemDetailModal.open({
      size: "medium",
      label: item.title,
      item,
      typeConfig: this.typeConfigs.find((c) => c.value === item.mediaType)
    });
    if (action === "edit") {
      this.openForm(item);
    } else if (action === "record") {
      this[NavigationMixin.Navigate]({
        type: "standard__recordPage",
        attributes: {
          recordId: item.id,
          objectApiName: "Media_Item__c",
          actionName: "view"
        }
      });
    }
  }

  handleEdit(event) {
    this.openForm(this.items.find((i) => i.id === event.detail.id));
  }

  async openForm(item) {
    const saved = await MediaItemForm.open({
      size: "medium",
      label: item ? `Edit "${item.title}"` : "Add to your list",
      item,
      typeConfigs: this.availableTypeConfigs,
      statusOptions: this.statusOptions,
      defaultMediaType:
        this.filter.mediaType || this.availableTypeConfigs[0]?.value,
      languageOptions: this.languageOptions,
      collections: this.collections,
      collectionTypeOptions: this.collectionTypeOptions,
      defaultCollectionId: this.filter.collectionId || null
    });
    if (saved) {
      this.toast("Saved", `"${saved.title}" was saved.`, "success");
      this.refresh();
    } else {
      // The form may have created a collection before a failed/cancelled save.
      this.loadCollections();
    }
  }

  async handleProgress(event) {
    const { id, step } = event.detail;
    try {
      const updated = await incrementProgress({ recordId: id, step });
      const before = this.items.find((i) => i.id === id);
      this.replaceItem(updated);
      if (updated.status === "Completed" && before?.status !== "Completed") {
        this.toast("Completed!", `You finished "${updated.title}".`, "success");
        this.loadCollections(); // completion counts changed
      }
      this.loadStats();
    } catch (e) {
      this.toast("Could not update progress", reduceErrors(e), "error");
    }
  }

  async handleFavorite(event) {
    try {
      this.replaceItem(await toggleFavorite({ recordId: event.detail.id }));
      this.loadStats();
      if (this.filter.favoritesOnly) {
        this.loadItems(true);
      }
    } catch (e) {
      this.toast("Could not update favorite", reduceErrors(e), "error");
    }
  }

  async handleDelete(event) {
    const item = this.items.find((i) => i.id === event.detail.id);
    const confirmed = await LightningConfirm.open({
      label: "Delete item",
      message: `Remove "${item?.title}" from your list? This cannot be undone.`,
      theme: "warning"
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteMediaItem({ recordId: event.detail.id });
      this.items = this.items.filter((i) => i.id !== event.detail.id);
      this.totalCount = Math.max(0, this.totalCount - 1);
      this.toast("Deleted", `"${item?.title}" was removed.`, "success");
      this.loadStats();
      this.loadCollections();
    } catch (e) {
      this.toast("Could not delete", reduceErrors(e), "error");
    }
  }

  // -------------------------------------------------------- collections

  /** Shows a collection's titles in collection order (from a card chip or the collections view). */
  handleCollectionSelect(event) {
    const collectionId = event.detail.collectionId || event.detail.id;
    this.filter = {
      ...this.filter,
      collectionId,
      sortBy: "collectionOrder",
      sortDirection: "ASC"
    };
    this.view = this.itemView;
    this.loadItems(true);
  }

  handleNewCollection() {
    this.openCollectionForm();
  }

  handleEditCollection(event) {
    this.openCollectionForm(
      this.collections.find((c) => c.id === event.detail.id)
    );
  }

  async openCollectionForm(collection) {
    const saved = await MediaCollectionForm.open({
      size: "small",
      label: collection ? `Edit "${collection.name}"` : "New collection",
      collection,
      collections: this.collections,
      typeOptions: this.collectionTypeOptions
    });
    if (saved) {
      this.toast("Saved", `"${saved.name}" was saved.`, "success");
      this.loadCollections();
      if (collection) {
        this.loadItems(true); // renamed collections show on the cards
      }
    }
  }

  async handleDeleteCollection(event) {
    const collection = this.collections.find((c) => c.id === event.detail.id);
    const confirmed = await LightningConfirm.open({
      label: "Delete collection",
      message: `Delete "${collection?.name}"? Its titles stay in your list, and any sub-collections move to the top level.`,
      theme: "warning"
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteCollection({ recordId: event.detail.id });
      this.toast("Deleted", `"${collection?.name}" was deleted.`, "success");
      if (this.filter.collectionId === event.detail.id) {
        this.filter = { ...this.filter, collectionId: "" };
      }
      this.loadCollections();
      this.loadItems(true);
    } catch (e) {
      this.toast("Could not delete", reduceErrors(e), "error");
    }
  }

  toast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }
}
