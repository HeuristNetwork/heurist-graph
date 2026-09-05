/**
 * @file HeuristGraphHostAdapter.js
 * @brief Host bridge for embedded heurist-graph operation.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HostAdapter } from "@heurist/client-core/host";

export class HeuristGraphHostAdapter extends HostAdapter {
  constructor({ bridge = null, baseUrl = null, database = null, fetchImpl = null } = {}) {
    super({ bridge, baseUrl, database, fetchImpl, moduleType: "graph" });
  }

  async initialize() {}

  supportsEditing() {
    return typeof this.bridge?.editRecord === "function";
  }

  async editRecord(recordId) {
    if (!this.supportsEditing())
      throw new Error("Record editing is not available from the Heurist host");
    return this.bridge.editRecord(Number(recordId));
  }

  async addRecord(recordTypeId) {
    const id = Number(recordTypeId);
    if (!Number.isInteger(id) || id < 1 || typeof this.bridge?.addRecord !== "function") {
      throw new Error("Record creation is not available from the Heurist host");
    }
    return this.bridge.addRecord(id);
  }

  getCapabilities() {
    return {
      editing: this.supportsEditing(),
      graphPreferences: Boolean(this.baseUrl && this.database),
      graphPublishing: Boolean(this.baseUrl && this.database),
    };
  }

  publishSelection(recordIds) {
    return this.bridge?.onSelection?.([...recordIds]);
  }

  requestCreateDataset() {
    return this.bridge?.requestCreateDataset?.();
  }

  loadGraphPreferences() {
    return this.loadPreferences();
  }

  saveGraphPreferences(settings) {
    return this.savePreferences(settings);
  }

  publishGraph(payload) {
    return this.publish(payload);
  }

  async destroy() {}
}
