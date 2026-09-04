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
    rules = this.config.rules,
    merge = false,
  } = {}) {
    const generation = ++this.generation;
    this.abortController?.abort("Superseded graph request");
    this.abortController = new AbortController();
    const result = await this.provider.load({
      query,
      rules,
      fields: this.config.fields,
      limits: this.config.limits,
      signal: this.abortController.signal,
    });
    if (generation !== this.generation)
      throw abortError("Superseded graph request");
    this.graph =
      merge && this.graph ? this.graph.merge(result.graph) : result.graph;
    this.config.query = query;
    await (merge
      ? this.engine.mergeGraph(this.graph)
      : this.engine.setGraph(this.graph));
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
