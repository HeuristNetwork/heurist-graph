/**
 * @file GraphApplication.js
 * @brief Coordinates graph loading, merging, selection, and rendering.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { GraphDocument } from "./GraphDocument.js";

export class GraphApplication extends EventTarget {
  constructor({ config, provider, engine, host, datasetProvider = null }) {
    super();
    this.config = config;
    this.provider = provider;
    this.engine = engine;
    this.host = host;
    this.datasetProvider = datasetProvider;
    this.graph = null;
    this.selection = normalizeIds(config.selection);
    this.abortController = null;
    this.generation = 0;
    // Legend state: record types and link groups the viewer has hidden.
    this.hiddenRecordTypes = new Set();
    this.hiddenLinks = new Set();
  }

  async initialize(container) {
    await this.host?.initialize?.({ config: this.config });
    await this.engine.initialize({
      container,
      options: this.config.engineOptions,
      onSelectionChange: (ids) => this.setSelection(ids, { fromEngine: true }),
      onNodeActivate: (id) => this.expandNode(id),
    });
    if (this.config.query != null && this.config.query !== "") {
      await this.load({ query: this.config.query });
    }
    return this;
  }

  async load({
    query = this.config.query,
    links,
    merge = false,
  } = {}) {
    const generation = ++this.generation;
    this.abortController?.abort("Superseded graph request");
    this.abortController = new AbortController();
    // An incremental expansion never re-runs internal-edge discovery; the
    // initial graph and a Saved Filter default to discovering every edge until
    // a Dataset supplies an explicit link set.
    const linkSelection = merge
      ? undefined
      : links ?? this.config.links ?? "all";
    const result = await this.provider.load({
      query,
      links: linkSelection,
      limits: this.config.limits,
      signal: this.abortController.signal,
    });
    if (generation !== this.generation)
      throw abortError("Superseded graph request");
    this.graph =
      merge && this.graph ? this.graph.merge(result.graph) : result.graph;
    this.config.query = query;
    const visible = this.#filterGraph(this.graph);
    await (merge
      ? this.engine.mergeGraph(visible)
      : this.engine.setGraph(visible));
    await this.engine.setSelection(this.selection);
    this.dispatchEvent(
      new CustomEvent("heurist-graph-loaded", { detail: result }),
    );
    return this.getState();
  }

  async setDataset(id) {
    const dataset = await this.datasetProvider?.load?.(id);
    const query = dataset?.source?.query ?? dataset?.query;
    if (query == null || query === "") throw new Error("Dataset query is empty");
    this.config.datasetId = Number(id);
    this.config.datasetTitle = dataset.title || dataset.rec_Title || null;
    return this.load({ query });
  }

  activateCurrentResults() {
    this.config.datasetId = null;
    return this.load({ query: this.config.currentResultsQuery ?? this.config.query });
  }

  activateFilter(filter) {
    return this.load({ query: filter.query });
  }

  applyConfiguration(value) {
    const settings = value?.options ? value : value?.config || value;
    const defaults = settings?.config?.defaults || {};
    this.config.limits = {
      ...this.config.limits,
      maxNodes: Number(defaults.maxNodes) || this.config.limits.maxNodes,
      maxEdges: Number(defaults.maxEdges) || this.config.limits.maxEdges,
    };
    this.config.persistedSettings = value;
    return this.getState();
  }

  exportGephi() {
    const payload = JSON.stringify({ nodes: this.graph?.records || [], edges: this.graph?.edges || [] }, null, 2);
    if (typeof document === "undefined") return payload;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    link.download = "heurist-graph.gephi.json";
    link.click();
    URL.revokeObjectURL(link.href);
    return payload;
  }

  async expandNode(recordId) {
    const id = Number(recordId);
    if (!Number.isInteger(id) || id < 1) return false;
    await this.load({ query: { ids: [id] }, merge: true });
    return true;
  }

  /**
   * Legend model derived from the loaded graph: node counts by record type and
   * edge counts by link group, each with its current visibility flag.
   */
  getLegend() {
    const recordTypes = new Map();
    const links = new Map();
    for (const record of this.graph?.records || []) {
      const key = record.recordTypeId || 0;
      recordTypes.set(key, (recordTypes.get(key) || 0) + 1);
    }
    for (const edge of this.graph?.edges || []) {
      const key = edgeGroupKey(edge);
      const entry = links.get(key) || {
        key,
        count: 0,
        link: edge.link || null,
        path: edge.path || null,
        fieldId: edge.fieldId || null,
        relationshipId: edge.relationshipId || null,
        spec: (edge.link && this.graph?.links?.[edge.link]) || null,
      };
      entry.count += 1;
      links.set(key, entry);
    }
    return {
      recordTypes: [...recordTypes.entries()].map(([recordTypeId, count]) => ({
        recordTypeId,
        count,
        visible: !this.hiddenRecordTypes.has(recordTypeId),
      })),
      links: [...links.values()].map((entry) => ({
        ...entry,
        visible: !this.hiddenLinks.has(entry.key),
      })),
    };
  }

  /** Show or hide every node of one record type without reloading. */
  async setRecordTypeVisibility(recordTypeId, visible) {
    const key = Number(recordTypeId) || 0;
    if (visible === false) this.hiddenRecordTypes.add(key);
    else this.hiddenRecordTypes.delete(key);
    await this.#renderVisible();
    return this.getLegend();
  }

  /** Show or hide every edge of one link group without reloading. */
  async setLinkVisibility(key, visible) {
    const group = String(key);
    if (visible === false) this.hiddenLinks.add(group);
    else this.hiddenLinks.delete(group);
    await this.#renderVisible();
    return this.getLegend();
  }

  async #renderVisible() {
    await this.engine.setGraph(this.#filterGraph(this.graph || new GraphDocument()));
    await this.engine.setSelection(this.selection);
  }

  /** Drop hidden record types, hidden link groups, and now-dangling edges. */
  #filterGraph(graph) {
    if (!this.hiddenRecordTypes.size && !this.hiddenLinks.size) return graph;
    const records = graph.records.filter(
      (record) => !this.hiddenRecordTypes.has(record.recordTypeId || 0),
    );
    const visibleIds = new Set(records.map((record) => record.id));
    const edges = graph.edges.filter(
      (edge) =>
        !this.hiddenLinks.has(edgeGroupKey(edge)) &&
        visibleIds.has(edge.from) &&
        visibleIds.has(edge.to),
    );
    return new GraphDocument({
      records,
      edges,
      links: graph.links,
      paths: graph.paths,
      limits: graph.limits,
    });
  }

  async setSelection(recordIds, { fromEngine = false } = {}) {
    this.selection = normalizeIds(recordIds);
    if (!fromEngine) await this.engine.setSelection(this.selection);
    this.dispatchEvent(
      new CustomEvent("heurist-graph-selection-changed", {
        detail: { recordIds: [...this.selection] },
      }),
    );
    this.host?.publishSelection?.(this.selection);
    return [...this.selection];
  }

  async clearSelection() {
    return this.setSelection([]);
  }

  getState() {
    return {
      query: this.config.query,
      datasetId: this.config.datasetId || null,
      datasetTitle: this.config.datasetTitle || null,
      selection: [...this.selection],
      recordIds: this.graph?.recordIds || [],
      limits: this.graph?.limits || null,
    };
  }

  resize() {
    return this.engine.resize();
  }

  async destroy() {
    this.generation += 1;
    this.abortController?.abort("Graph destroyed");
    await this.engine.destroy();
    await this.host?.destroy?.();
  }
}

/** Stable key that groups edges by configured link, then field, then relation. */
function edgeGroupKey(edge) {
  if (edge.link) return `link:${edge.link}`;
  if (edge.path) return `path:${edge.path}`;
  if (edge.fieldId) return `field:${edge.fieldId}`;
  if (edge.relationshipId) return `relationship:${edge.relationshipId}`;
  return "other";
}

function normalizeIds(value) {
  const values = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      values.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

function abortError(message) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}
