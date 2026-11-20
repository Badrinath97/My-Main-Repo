import { LightningElement, api, wire } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import LightningConfirm from "lightning/confirm";
import { getObjectInfo, getPicklistValues } from "lightning/uiObjectInfoApi";
import MEDIA_ITEM_OBJECT from "@salesforce/schema/Media_Item__c";
import STATUS_FIELD from "@salesforce/schema/Media_Item__c.Status__c";
import getTypeConfigs from "@salesforce/apex/MediaTrackerController.getTypeConfigs";
import getMediaItems from "@salesforce/apex/MediaTrackerController.getMediaItems";
import getStats from "@salesforce/apex/MediaTrackerController.getStats";
import incrementProgress from "@salesforce/apex/MediaTrackerController.incrementProgress";
import toggleFavorite from "@salesforce/apex/MediaTrackerController.toggleFavorite";
import deleteMediaItem from "@salesforce/apex/MediaTrackerController.deleteMediaItem";
import MediaItemForm from "c/mediaItemForm";
import {
  SORT_OPTIONS,
  defaultDirectionFor,
  parseList,
  reduceErrors
} from "c/mediaTrackerUtils";

const DEFAULT_PAGE_SIZE = 12;

/**
 * Media Tracker container.
 *
 * Owns state and server calls; delegates rendering to child components:
 *   c-media-stats      summary tiles
 *   c-media-filter-bar search / filter / sort / view toggle
 *   c-media-card       one item
 *   c-media-item-form  create / edit modal
 *
 * Drop several instances on different pages with different settings,
 * e.g. an "Anime" tab restricted via mediaTypes="Anime".
 */
export default class MediaTracker extends LightningElement {
  @api cardTitle = "My Media Tracker";
  /** Comma-separated Media_Type__c values this instance is limited to. Blank = all. */
  @api mediaTypes = "";
  /** 'grid' | 'list' */
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
  view = "grid";
  filter = {};
  sortOptions = SORT_OPTIONS;

  _requestId = 0;

  connectedCallback() {
    this.view = this.defaultView === "list" ? "list" : "grid";
    const sortBy = this.defaultSort || "lastModified";
    this.filter = {
      searchTerm: "",
      mediaType: "",
      status: "",
      favoritesOnly: false,
      sortBy,
      sortDirection: defaultDirectionFor(sortBy)
    };
    this.refresh();
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

  @wire(getPicklistValues, {
    recordTypeId: "$objectInfo.data.defaultRecordTypeId",
    fieldApiName: STATUS_FIELD
  })
  wiredStatuses({ data }) {
    if (data) {
      this.statusOptions = data.values.map(({ label, value }) => ({
        label,
        value
      }));
    }
  }

  // ---------------------------------------------------------- public API

  /** Reloads items and stats. Callable by a parent component. */
  @api
  refresh() {
    this.loadItems(true);
    this.loadStats();
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

  get showStats() {
    return !this.hideStats;
  }

  get showAddButton() {
    return !this.hideAddButton;
  }

  get hasItems() {
    return this.items.length > 0;
  }

  get showEmptyState() {
    return !this.isLoading && !this.error && this.items.length === 0;
  }

  get hasActiveFilters() {
    const f = this.filter;
    return Boolean(f.searchTerm || f.mediaType || f.status || f.favoritesOnly);
  }

  get emptyMessage() {
    return this.hasActiveFilters
      ? "Nothing matches these filters."
      : "Your list is empty. Add something you're watching, reading or playing!";
  }

  get listClass() {
    return this.view === "list" ? "items items_list" : "items items_grid";
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
    } catch (e) {
      if (requestId === this._requestId) {
        this.error = reduceErrors(e);
      }
    } finally {
      if (requestId === this._requestId) {
        this.isLoading = false;
      }
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
  }

  handleLoadMore() {
    this.loadItems(false);
  }

  handleAdd() {
    this.openForm();
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
        this.filter.mediaType || this.availableTypeConfigs[0]?.value
    });
    if (saved) {
      this.toast("Saved", `"${saved.title}" was saved.`, "success");
      this.refresh();
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
    } catch (e) {
      this.toast("Could not delete", reduceErrors(e), "error");
    }
  }

  toast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }
}
