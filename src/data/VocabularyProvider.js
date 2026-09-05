/**
 * @file VocabularyProvider.js
 * @brief Resolves edge detail-type and relation-type labels from the Heurist API.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 *
 * The graph endpoint reports edges by numeric id only (`fieldId` = detail type
 * dty_ID, `relationshipId` = relation-type trm_ID). This provider turns those
 * ids into human labels for the graph and the legend:
 *
 *   - detail types: GET /fields?details=name&dty_ID=1,3,16
 *   - relation types: GET /trl?parentId=<id> (direct children, walked
 *     recursively into a tree) then GET /trm?details=name&trm_ID=... for labels
 *
 * Every lookup is cached by id (including misses) so repeated loads and node
 * expansions only fetch ids not seen before.
 */

/** Rows live under `items` in every current Heurist REST response. */
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function uniqueIds(ids) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

/** Non-null subset of `cache` for `ids`, preserving request order. */
function pick(cache, ids) {
  const out = new Map();
  for (const id of uniqueIds(ids)) {
    const value = cache.get(id);
    if (value != null) out.set(id, value);
  }
  return out;
}

export class VocabularyProvider {
  constructor({ apiClient, maxTreeDepth = 12 } = {}) {
    this.apiClient = apiClient;
    this.maxTreeDepth = maxTreeDepth;
    this.fieldNames = new Map(); // dty_ID -> name (null = looked up, not found)
    this.termNames = new Map(); // trm_ID -> label (null = looked up, not found)
    this.termChildren = new Map(); // trm_ID -> number[] direct children
  }

  /**
   * Resolve detail-type (field) names.
   * @param {number[]} ids dty_ID values.
   * @returns {Promise<Map<number,string>>} id -> name for the ids that resolved.
   */
  async getFieldNames(ids, { signal } = {}) {
    const missing = uniqueIds(ids).filter((id) => !this.fieldNames.has(id));
    if (missing.length) {
      let rows = [];
      try {
        const payload = await this.apiClient.get("/fields", {
          query: { details: "name", dty_ID: missing.join(",") },
          signal,
        });
        rows = rowsOf(payload);
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        // Leave the ids uncached so a later load can retry.
        return pick(this.fieldNames, ids);
      }
      for (const row of rows) {
        const id = Number(row?.dty_ID ?? row?.id);
        const name = row?.dty_Name ?? row?.dty_Label ?? row?.name;
        if (Number.isInteger(id) && id > 0 && name != null) {
          this.fieldNames.set(id, String(name));
        }
      }
      for (const id of missing) {
        if (!this.fieldNames.has(id)) this.fieldNames.set(id, null);
      }
    }
    return pick(this.fieldNames, ids);
  }

  /**
   * Build the descendant tree of every relation-type root and resolve labels
   * for every term in it. The trees are meant to be kept by the legend
   * renderer; `names` covers roots and descendants alike.
   *
   * @param {number[]} rootIds relation-type trm_ID values seen on edges.
   * @returns {Promise<{names: Map<number,string>, trees: Record<number, object>}>}
   *   `trees[rootId]` is `{ id, label, children: [...] }` (recursive).
   */
  async getRelationTypeTrees(rootIds, { signal } = {}) {
    const roots = uniqueIds(rootIds);
    if (!roots.length) return { names: new Map(), trees: {} };

    const seen = new Set();
    const walk = async (id, depth) => {
      if (seen.has(id)) return { id, children: [] };
      seen.add(id);
      if (depth >= this.maxTreeDepth) return { id, children: [] };
      const childIds = await this.#childTermIds(id, signal);
      const children = await Promise.all(
        childIds.map((childId) => walk(childId, depth + 1)),
      );
      return { id, children };
    };

    const bare = {};
    for (const root of roots) bare[root] = await walk(root, 0);
    await this.#loadTermNames([...seen], signal);

    const decorate = (node) => ({
      id: node.id,
      label: this.termNames.get(node.id) ?? String(node.id),
      children: node.children.map(decorate),
    });
    const trees = {};
    for (const root of roots) trees[root] = decorate(bare[root]);
    return { names: pick(this.termNames, [...seen]), trees };
  }

  /** GET /trl?parentId=<id> -> direct child trm_ID list (cached). */
  async #childTermIds(id, signal) {
    if (this.termChildren.has(id)) return this.termChildren.get(id);
    let rows = [];
    try {
      const payload = await this.apiClient.get("/trl", {
        query: { parentId: id },
        signal,
      });
      rows = rowsOf(payload);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      this.termChildren.set(id, []);
      return [];
    }
    const childIds = uniqueIds(
      rows.map((row) => Number(row?.trl_TermID ?? row?.trm_ID ?? row?.id)),
    );
    this.termChildren.set(id, childIds);
    return childIds;
  }

  /** GET /trm?details=name&trm_ID=<csv> -> fills `termNames` (cached, misses too). */
  async #loadTermNames(ids, signal) {
    const missing = uniqueIds(ids).filter((id) => !this.termNames.has(id));
    if (!missing.length) return;
    let rows = [];
    try {
      const payload = await this.apiClient.get("/trm", {
        query: { details: "name", trm_ID: missing.join(",") },
        signal,
      });
      rows = rowsOf(payload);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return;
    }
    for (const row of rows) {
      const id = Number(row?.trm_ID ?? row?.id);
      const name = row?.trm_Label ?? row?.trm_Name ?? row?.name ?? row?.label;
      if (Number.isInteger(id) && id > 0 && name != null) {
        this.termNames.set(id, String(name));
      }
    }
    for (const id of missing) {
      if (!this.termNames.has(id)) this.termNames.set(id, null);
    }
  }
}
