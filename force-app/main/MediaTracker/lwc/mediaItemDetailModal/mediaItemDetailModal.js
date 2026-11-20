import { api } from "lwc";
import LightningModal from "lightning/modal";

/**
 * Details window for one media item. Usage:
 *   const action = await MediaItemDetailModal.open({ size: 'medium', label, item, typeConfig });
 * Resolves with 'edit', 'record' (open the record page), or undefined when closed.
 */
export default class MediaItemDetailModal extends LightningModal {
  @api item;
  @api typeConfig;

  handleEdit() {
    this.close("edit");
  }

  handleRecord() {
    this.close("record");
  }

  handleClose() {
    this.close();
  }
}
