import { api } from "lwc";
import LightningModal from "lightning/modal";
import saveCollection from "@salesforce/apex/MediaTrackerController.saveCollection";
import {
  collectionOptions,
  collectionWithDescendants,
  reduceErrors
} from "c/mediaTrackerUtils";

const NONE = "__none__";

/**
 * Create / edit a collection. Usage:
 *   const saved = await MediaCollectionForm.open({ size: 'small', label, collection, collections, typeOptions });
 * Resolves with the saved MediaCollectionData, or undefined if cancelled.
 */
export default class MediaCollectionForm extends LightningModal {
  /** Existing MediaCollectionData to edit; omit to create. */
  @api collection;
  /** All MediaCollectionData, for the parent picker. */
  @api collections = [];
  /** [{ label, value }] for Collection_Type__c. */
  @api typeOptions = [];
  /** Pre-selected parent when creating a sub-collection. */
  @api defaultParentId;

  draft = {};
  isSaving = false;
  error;

  connectedCallback() {
    this.draft = this.collection
      ? { ...this.collection }
      : { name: "", parentId: this.defaultParentId || null };
  }

  /** Every collection except this one and its own sub-collections. */
  get parentOptions() {
    const blocked = this.draft.id
      ? collectionWithDescendants(this.collections, this.draft.id)
      : new Set();
    return [
      { label: "None (top level)", value: NONE },
      ...collectionOptions(
        (this.collections || []).filter((c) => !blocked.has(c.id))
      )
    ];
  }

  get parentValue() {
    return this.draft.parentId || NONE;
  }

  get saveLabel() {
    return this.isSaving ? "Saving..." : "Save";
  }

  handleChange(event) {
    const field = event.target.dataset.field;
    let value = event.detail.value;
    if (value === NONE) {
      value = null;
    }
    this.draft = { ...this.draft, [field]: value };
  }

  handleCancel() {
    this.close();
  }

  async handleSave() {
    const valid = [...this.template.querySelectorAll("[data-field]")]
      .filter((input) => typeof input.reportValidity === "function")
      .map((input) => input.reportValidity())
      .every(Boolean);
    if (!valid) {
      return;
    }
    this.isSaving = true;
    this.disableClose = true;
    this.error = undefined;
    try {
      const { id, name, collectionType, parentId, description, posterUrl } =
        this.draft;
      const saved = await saveCollection({
        collection: {
          id,
          name,
          collectionType: collectionType || null,
          parentId: parentId || null,
          description,
          posterUrl
        }
      });
      this.disableClose = false;
      this.close(saved);
    } catch (e) {
      this.error = reduceErrors(e);
    } finally {
      this.isSaving = false;
      this.disableClose = false;
    }
  }
}
