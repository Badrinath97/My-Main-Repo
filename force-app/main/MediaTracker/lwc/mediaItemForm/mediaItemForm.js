import { api } from "lwc";
import LightningModal from "lightning/modal";
import saveMediaItem from "@salesforce/apex/MediaTrackerController.saveMediaItem";
import { STATUS, reduceErrors } from "c/mediaTrackerUtils";

const INTEGER_FIELDS = ["releaseYear", "progressCurrent", "progressTotal"];
const DECIMAL_FIELDS = ["rating"];
const DATE_FIELDS = ["startDate", "completedDate"];
const READ_ONLY_FIELDS = [
  "progressPercent",
  "lastModifiedDate",
  "currentSeasonNumber"
];

/**
 * Create / edit modal. Usage:
 *   const saved = await MediaItemForm.open({ size: 'medium', label, item, typeConfigs, statusOptions, defaultMediaType });
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

  draft = {};
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
          progressCurrent: 0
        };
    // Each row needs a stable key for for:each, including unsaved rows.
    this.draft.seasons = (this.item?.seasons || []).map((s) => ({
      ...s,
      key: s.id || this.nextSeasonKey()
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
    const value =
      event.target.type === "toggle" || event.target.type === "checkbox"
        ? event.target.checked
        : event.detail.value;
    this.draft = { ...this.draft, [field]: value };
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

  handleCancel() {
    this.close();
  }

  async handleSave() {
    const inputs = [
      ...this.template.querySelectorAll("[data-field], [data-season-field]")
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
    if (!this.tracksProgress) {
      payload.progressCurrent = 0;
      payload.progressTotal = null;
    }
    // A list (even empty) tells Apex to replace the item's seasons; omitting
    // it leaves them untouched, which is what we want for other types.
    if (this.tracksSeasons) {
      payload.seasons = this.draft.seasons.map((s) => ({
        id: s.id,
        seasonNumber: toNumber(s.seasonNumber, true),
        episodeCount: toNumber(s.episodeCount, true),
        episodesWatched: toNumber(s.episodesWatched, true) ?? 0
      }));
    } else {
      delete payload.seasons;
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
