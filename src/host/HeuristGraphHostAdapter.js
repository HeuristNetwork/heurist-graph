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
  constructor({ bridge = null } = {}) {
    super();
    this.bridge = bridge;
  }

  async initialize() {}

  publishSelection(recordIds) {
    return this.bridge?.onSelection?.([...recordIds]);
  }

  requestCreateDataset() {
    return this.bridge?.requestCreateDataset?.();
  }

  publishData(payload) {
    return this.bridge?.publishData?.(payload);
  }

  /** Whether the host can run a Heurist record search (delegate ON_REC_SEARCHSTART). */
  supportsSearch() {
    return typeof this.bridge?.doSearch === "function";
  }

  /** Delegate a Current Results/Filter search to the host's global search engine. */
  doSearch(request) {
    if (!this.supportsSearch())
      throw new Error("Host record search is unavailable");
    return this.bridge.doSearch(request);
  }

  async destroy() {}
}
