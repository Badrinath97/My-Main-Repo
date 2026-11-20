import { api } from "lwc";
import LightningModal from "lightning/modal";
import saveMediaItem from "@salesforce/apex/MediaTrackerController.saveMediaItem";
import saveCollection from "@salesforce/apex/MediaTrackerController.saveCollection";
import {
  STATUS,
  collectionOptions,
  customSeasonName,
  reduceErrors
} from "c/mediaTrackerUtils";

const NONE = "__none__";
/** Collection combobox value that reveals the inline "new collection" inputs. */
const NEW_COLLECTION = "__new__";

/**
 * Form fields a media type can hide through Media_Type_Config__mdt.Hidden_Form_Fields__c,
 * e.g. Anime hides releaseYear, platform, startDate, completedDate, collection, posterUrl.
 */
const HIDEABLE_FIELDS = [
  "releaseYear",
  "platform",
  "genre",
  "rating",
  "startDate",
  "completedDate",
  "language",
  "collection",
  "posterUrl",
  "notes",
  "seasonAiredDate",
  "seasonCompletedDate",
  "movieAiredDate"
];

const INTEGER_FIELDS = [
  "releaseYear",
  "progressCurrent",
  "progressTotal",
  "collectionOrder"
];
const DECIMAL_FIELDS = ["rating"];
const DATE_FIELDS = ["startDate", "completedDate"];
const READ_ONLY_FIELDS = [
  "progressPercent",
  "lastModifiedDate",
  "currentSeasonNumber",
  "collectionName"
];

/**
 * Create / edit modal. Usage:
 *   const saved = await MediaItemForm.open({ size: 'medium', label, item, typeConfigs, statusOptions,
 *     defaultMediaType, languageOptions, collections, collectionTypeOptions, defaultCollectionId });
 * Resolves with the saved MediaItemData, or undefined if cancelled.
 */
export default class MediaItemForm extends LightningModal {
  /** Existing MediaItemData to edit; omit to create. */
  @api item;
  /** MediaTypeConfigData[] the user may choose from. */
  @api typeConfigs = [];
  /** [{ label, value }] for Status__c. */
  @api statusOptions = [];
  @api defaultMediaType;
  /** [{ label, value }] for Language__c. */
  @api languageOptions = [];
  /** MediaCollectionData[] in tree order. */
  @api collections = [];
  /** [{ label, value }] for Media_Collection__c.Collection_Type__c. */
  @api collectionTypeOptions = [];
  /** Pre-selected collection for new items (e.g. the collection being browsed). */
  @api defaultCollectionId;

  draft = {};
  /** Inline "new collection" inputs, used when the collection picker is set to New. */
  newCollection = { name: "", collectionType: null, parentId: null };
  isSaving = false;
  error;

  _seasonKey = 0;

  connectedCallback() {
    this.draft = this.item
      ? { ...this.item }
      : {
          title: "",
          mediaType: this.defaultMediaType || this.typeConfigs?.[0]?.value,
          status: STATUS.PLANNED,
          isFavorite: false,
          progressCurrent: 0,
          collectionId: this.defaultCollectionId || null
        };
    // Each row needs a stable key for for:each, including unsaved rows.
    this.draft.seasons = (this.item?.seasons || []).map((s) => ({
      ...s,
      name: customSeasonName(s), // blank unless the season has a real name
      key: s.id || this.nextSeasonKey()
    }));
    this.draft.movies = (this.item?.movies || []).map((m) => ({
      id: m.id,
      name: m.name,
      airedDate: m.airedDate,
      watched: m.isComplete === true,
      key: m.id || this.nextSeasonKey()
    }));
  }

  nextSeasonKey() {
    this._seasonKey += 1;
    return `new-${this._seasonKey}`;
  }

  get typeOptions() {
    return (this.typeConfigs || []).map(({ label, value }) => ({
      label,
      value
    }));
  }

  get resolvedStatusOptions() {
    return this.statusOptions?.length
      ? this.statusOptions
      : Object.values(STATUS).map((value) => ({ label: value, value }));
  }

  get currentConfig() {
    return (this.typeConfigs || []).find(
      (c) => c.value === this.draft.mediaType
    );
  }

  get tracksProgress() {
    return this.currentConfig?.tracksProgress === true;
  }

  get tracksSeasons() {
    return this.currentConfig?.tracksSeasons === true;
  }

  get hasSeasons() {
    return this.draft.seasons.length > 0;
  }

  /** { releaseYear: true, platform: false, ... } for the selected type. Hidden values are kept, just not shown. */
  get visible() {
    const hidden = new Set(this.currentConfig?.hiddenFields || []);
    return Object.fromEntries(HIDEABLE_FIELDS.map((f) => [f, !hidden.has(f)]));
  }

  get showCompletedDate() {
    return this.isCompleted && this.visible.completedDate;
  }

  get showCollectionOrder() {
    return this.visible.collection && this.hasCollection;
  }

  get showNewCollection() {
    return this.visible.collection && this.isNewCollection;
  }

  get tracksMovies() {
    return this.currentConfig?.tracksMovies === true;
  }

  get hasMovies() {
    return this.draft.movies.length > 0;
  }

  get movieRows() {
    return this.draft.movies.map((movie, index) => ({
      ...movie,
      index,
      label: `Movie ${index + 1}`
    }));
  }

  get movieSummary() {
    const movies = this.draft.movies;
    const watched = movies.filter((m) => m.watched).length;
    return `${watched} of ${movies.length} movie${movies.length === 1 ? "" : "s"} watched`;
  }

  /** With seasons, overall progress is calculated from them, so hide the manual inputs. */
  get showOverallProgress() {
    return this.tracksProgress && !(this.tracksSeasons && this.hasSeasons);
  }

  get seasonRows() {
    return this.draft.seasons.map((season, index) => ({
      ...season,
      index,
      maxWatched: season.episodeCount ?? undefined
    }));
  }

  get seasonSummary() {
    const seasons = this.draft.seasons;
    const watched = seasons.reduce(
      (sum, s) => sum + (Number(s.episodesWatched) || 0),
      0
    );
    const allKnown = seasons.every(
      (s) => s.episodeCount !== null && s.episodeCount !== ""
    );
    const total = seasons.reduce(
      (sum, s) => sum + (Number(s.episodeCount) || 0),
      0
    );
    const count = `${seasons.length} season${seasons.length === 1 ? "" : "s"}`;
    return allKnown
      ? `${count} · ${watched} of ${total} episodes watched`
      : `${count} · ${watched} episodes watched (total unknown while a season is still airing)`;
  }

  get languageComboOptions() {
    return [{ label: "None", value: NONE }, ...(this.languageOptions || [])];
  }

  get languageValue() {
    return this.draft.language || NONE;
  }

  get collectionComboOptions() {
    return [
      { label: "None", value: NONE },
      ...collectionOptions(this.collections),
      { label: "+ New collection...", value: NEW_COLLECTION }
    ];
  }

  get collectionValue() {
    return this.draft.collectionId || NONE;
  }

  get isNewCollection() {
    return this.draft.collectionId === NEW_COLLECTION;
  }

  get hasCollection() {
    return Boolean(this.draft.collectionId);
  }

  get newCollectionParentOptions() {
    return [
      { label: "None (top level)", value: NONE },
      ...collectionOptions(this.collections)
    ];
  }

  get newCollectionParentValue() {
    return this.newCollection.parentId || NONE;
  }

  get progressCurrentLabel() {
    const unit = this.currentConfig?.progressUnit;
    return unit ? `${unit} done` : "Progress";
  }

  get progressTotalLabel() {
    const unit = this.currentConfig?.progressUnit;
    return unit ? `Total ${unit.toLowerCase()}` : "Total";
  }

  get progressMax() {
    return this.draft.progressTotal || undefined;
  }

  get isCompleted() {
    return this.draft.status === STATUS.COMPLETED;
  }

  get saveLabel() {
    return this.isSaving ? "Saving..." : "Save";
  }

  handleChange(event) {
    const field = event.target.dataset.field;
    let value =
      event.target.type === "toggle" || event.target.type === "checkbox"
        ? event.target.checked
        : event.detail.value;
    if (value === NONE) {
      value = null;
    }
    this.draft = { ...this.draft, [field]: value };
  }

  handleNewCollectionChange(event) {
    let value = event.detail.value;
    if (value === NONE) {
      value = null;
    }
    this.newCollection = {
      ...this.newCollection,
      [event.target.dataset.collectionField]: value
    };
  }

  handleAddSeason() {
    const seasons = this.draft.seasons;
    const nextNumber = seasons.length
      ? Math.max(...seasons.map((s) => Number(s.seasonNumber) || 0)) + 1
      : 1;
    this.draft = {
      ...this.draft,
      seasons: [
        ...seasons,
        {
          key: this.nextSeasonKey(),
          seasonNumber: nextNumber,
          episodeCount: null,
          episodesWatched: 0
        }
      ]
    };
  }

  handleSeasonChange(event) {
    const index = Number(event.target.dataset.index);
    const field = event.target.dataset.seasonField;
    const seasons = [...this.draft.seasons];
    seasons[index] = { ...seasons[index], [field]: event.detail.value };
    this.draft = { ...this.draft, seasons };
  }

  handleRemoveSeason(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.draft = {
      ...this.draft,
      seasons: this.draft.seasons.filter((s, i) => i !== index)
    };
  }

  handleAddMovie() {
    this.draft = {
      ...this.draft,
      movies: [
        ...this.draft.movies,
        { key: this.nextSeasonKey(), name: "", watched: false }
      ]
    };
  }

  handleMovieChange(event) {
    const index = Number(event.target.dataset.index);
    const field = event.target.dataset.movieField;
    const value =
      field === "watched" ? event.target.checked : event.detail.value;
    const movies = [...this.draft.movies];
    movies[index] = { ...movies[index], [field]: value };
    this.draft = { ...this.draft, movies };
  }

  handleRemoveMovie(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.draft = {
      ...this.draft,
      movies: this.draft.movies.filter((m, i) => i !== index)
    };
  }

  handleCancel() {
    this.close();
  }

  async handleSave() {
    const inputs = [
      ...this.template.querySelectorAll(
        "[data-field], [data-season-field], [data-movie-field], [data-collection-field]"
      )
    ];
    // reportValidity() on every input so all errors are shown at once
    const allValid = inputs
      .filter((input) => typeof input.reportValidity === "function")
      .map((input) => input.reportValidity())
      .every(Boolean);
    if (!allValid) {
      return;
    }

    this.isSaving = true;
    this.disableClose = true;
    this.error = undefined;
    try {
      if (this.showNewCollection) {
        // Create the collection first. If the item save then fails, the draft
        // already points at the new collection, so a retry won't duplicate it.
        const created = await saveCollection({
          collection: { ...this.newCollection }
        });
        this.draft = { ...this.draft, collectionId: created.id };
      }
      const saved = await saveMediaItem({ item: this.toPayload() });
      this.disableClose = false;
      this.close(saved);
    } catch (e) {
      this.error = reduceErrors(e);
    } finally {
      this.isSaving = false;
      this.disableClose = false;
    }
  }

  /** Converts the form's string values into the types MediaItemData expects. */
  toPayload() {
    const payload = { ...this.draft };
    READ_ONLY_FIELDS.forEach((f) => delete payload[f]);
    INTEGER_FIELDS.forEach((f) => (payload[f] = toNumber(payload[f], true)));
    DECIMAL_FIELDS.forEach((f) => (payload[f] = toNumber(payload[f], false)));
    DATE_FIELDS.forEach((f) => (payload[f] = payload[f] || null));
    payload.language = payload.language || null;
    // "New collection" picked but then hidden by switching type: create nothing.
    payload.collectionId =
      payload.collectionId === NEW_COLLECTION
        ? null
        : payload.collectionId || null;
    if (!payload.collectionId) {
      payload.collectionOrder = null;
    }
    if (!this.tracksProgress) {
      payload.progressCurrent = 0;
      payload.progressTotal = null;
    }
    // A list (even empty) tells Apex to replace the item's seasons; omitting
    // it leaves them untouched, which is what we want for other types.
    if (this.tracksSeasons) {
      payload.seasons = this.draft.seasons.map((s) => ({
        id: s.id,
        // Blank -> Apex names it "Season N" (and renames it if the number changes).
        name: (s.name || "").trim() || null,
        seasonNumber: toNumber(s.seasonNumber, true),
        episodeCount: toNumber(s.episodeCount, true),
        episodesWatched: toNumber(s.episodesWatched, true) ?? 0,
        airedDate: s.airedDate || null,
        completedDate: s.completedDate || null
      }));
    } else {
      delete payload.seasons;
    }
    // Same rule for movies: a list replaces them, omitting leaves them alone.
    if (this.tracksMovies) {
      payload.movies = this.draft.movies.map((m) => ({
        id: m.id,
        name: m.name,
        episodesWatched: m.watched ? 1 : 0,
        airedDate: m.airedDate || null
      }));
    } else {
      delete payload.movies;
    }
    return payload;
  }
}

function toNumber(value, integer) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  if (Number.isNaN(n)) {
    return null;
  }
  return integer ? Math.trunc(n) : n;
}
