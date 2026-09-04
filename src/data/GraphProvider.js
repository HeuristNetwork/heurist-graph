/**
 * @file GraphProvider.js
 * @brief Loads graph documents from the Heurist records API.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { GraphDocument } from "../core/GraphDocument.js";

export class GraphProvider {
  constructor({ apiClient }) {
    this.apiClient = apiClient;
  }

  async load({
    query,
    rules = [],
    fields = ["rec_Title", "rec_RecTypeID"],
    limit = 100,
    offset = 0,
    signal,
  } = {}) {
    if (query == null || query === "")
      throw new TypeError("A graph query is required");
    const payload = await this.apiClient.post("/records", {
      signal,
      body: { query, detail: "graph", rules, fields, limit, offset },
    });
    return {
      ids: Array.isArray(payload?.ids) ? payload.ids.map(Number) : [],
      total: Number(payload?.total) || 0,
      offset: Number(payload?.offset) || 0,
      limit: Number(payload?.limit) || limit,
      graph: new GraphDocument(payload?.graph || payload || {}),
    };
  }
}
