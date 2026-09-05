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
  constructor({
    config,
    provider,
    engine,
    host,
    datasetProvider = null,
    recordContentProvider = null,
  }) {
    super();
    this.config = config;
    this.provider = provider;
    this.engine = engine;
    this.host = host;
    this.datasetProvider = datasetProvider;
    this.recordContentProvider = recordContentProvider;
    this.graph = null;
    this.selection = normalizeIds(config.selection);
    this.abortController = null;
    this.generation = 0;
    // Legend state: record types and link groups the viewer has hidden.
    this.hiddenRecordTypes = new Set();
    this.hiddenLinks = new Set();
    // Active source tracking, mirroring heurist-data's DataApplication: a
    // persisted Dataset "wins" against inbound Filtered Result queries until
    // the viewer explicitly reactivates Filtered Result.
    this.source = null;
    this.currentResultsQuery =
      config.query == null || config.query === "" ? null : config.query;
    // DOM handles for the empty-result presentation. Set by initialize().
    this.canvasElement = null;
    this.messageElement = null;
  }

  async initialize(container, { messageElement = null } = {}) {
    this.canvasElement = container;
    this.messageElement = messageElement;
    await this.host?.initialize?.({ config: this.config });
    await this._loadInitialPreferences();
    await this.engine.initialize({
      container,
      options: this.config.engineOptions,
      onSelectionChange: (ids) => this.setSelection(ids, { fromEngine: true }),
      onNodeActivate: (id) => this.expandNode(id),
      onPopupContentRequest: (request) => this.requestPopupContent(request),
    });
    if (this.config.query != null && this.config.query !== "") {
      await this.load({ query: this.config.query });
    } else {
      this.#setEmptyState(true);
    }
    return this;
  }

  /**
   * Load host-persisted settings before the engine's first render, matching
   * heurist-data's DataApplication. This only runs when the bootstrap didn't
   * already embed persisted settings (`config.loadPreferencesOnInit`), so a
   * host that inlines settings at bootstrap never pays for a redundant fetch.
   */
  async _loadInitialPreferences() {
    if (
      !this.config.loadPreferencesOnInit ||
      typeof this.host?.loadPreferences !== "function"
    )
      return;
    try {
      const saved = await this.host.loadPreferences();
      if (!saved) return;
      const { normalizeGraphConfigurationSettings } = await import(
        "../ui/config/graphConfigurationSchema.js"
      );
      const normalized = normalizeGraphConfigurationSettings(saved);
      this.config.persistedSettings = normalized;
      this.config.ui = normalized.options.ui;
      this.config.limits = {
        ...this.config.limits,
        maxNodes:
          Number(normalized.config.defaults.maxNodes) ||
          this.config.limits.maxNodes,
        maxEdges:
          Number(normalized.config.defaults.maxEdges) ||
          this.config.limits.maxEdges,
      };
      this.config.engineOptions = {
        ...this.config.engineOptions,
        gravity: normalized.config.defaults.gravity,
        scaling: normalized.config.defaults.scaling,
        labelMaxLength: normalized.config.defaults.labelLength,
        popupDelay: normalized.config.defaults.popupDelay,
        popupTemplate: normalized.config.defaults.popupTemplate,
        selectionEnabled: normalized.options.interaction.selectionEnabled,
        popupEnabled: normalized.options.interaction.popupEnabled,
      };
    } catch (error) {
      this.dispatch("heurist-graph-error", { error, operation: "load-preferences" });
    }
  }

  /**
   * Load or merge a graph for a query.
   *
   * A plain (non-merge) call is ignored while a persisted Dataset is the
   * active source - matching heurist-data's `DataApplication.setQuery()` -
   * so a Filtered Result query the host pushes (a global search event, once
   * applied after the widget becomes visible) never clobbers a Dataset the
   * viewer deliberately selected. Internal callers that manage `this.source`
   * themselves (`setDataset`, `activateCurrentResults`) pass `internal: true`
   * to bypass that guard.
   *
   * Whatever the outcome, the *remembered* Filtered Result query is still
   * updated first (matching heurist-data's "host search events keep Current
   * Results up to date" comment) so `activateCurrentResults()` always
   * restores the latest one, even one that arrived while a Dataset was on
   * screen - not a stale query from before the Dataset was selected. Pass
   * `remember: false` to skip that (restoring/loading a Dataset's own query
   * must never be remembered as a Filtered Result query).
   *
   * An explicit `null`/empty query always wins, even over an active Dataset -
   * it deactivates any Dataset and shows the empty-result message.
   */
  async load({
    query = this.config.query,
    links,
    merge = false,
    internal = false,
    remember = true,
  } = {}) {
    const normalizedQuery = query == null || query === "" ? null : query;

    if (normalizedQuery == null && !merge) {
      this.generation += 1;
      this.abortController?.abort("Graph cleared");
      this.source = null;
      this.config.datasetId = null;
      this.config.datasetTitle = null;
      this.config.query = null;
      this.graph = new GraphDocument();
      await this.engine.setGraph(this.graph);
      await this.engine.setSelection(this.selection);
      this.#setEmptyState(true);
      this.dispatchEvent(
        new CustomEvent("heurist-graph-loaded", {
          detail: { graph: this.graph, total: 0 },
        }),
      );
      return this.getState();
    }

    if (!merge) {
      if (normalizedQuery != null && remember) {
        this.currentResultsQuery = normalizedQuery;
      }
      if (this.source?.type === "dataset" && !internal) return this.getState();
      if (!internal) this.source = { type: "query", query: normalizedQuery };
    }

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
      query: normalizedQuery,
      links: linkSelection,
      limits: this.config.limits,
      signal: this.abortController.signal,
    });
    if (generation !== this.generation)
      throw abortError("Superseded graph request");
    this.graph =
      merge && this.graph ? this.graph.merge(result.graph) : result.graph;
    this.config.query = normalizedQuery;
    const visible = this.#filterGraph(this.graph);
    await (merge
      ? this.engine.mergeGraph(visible)
      : this.engine.setGraph(visible));
    await this.engine.setSelection(this.selection);
    // Reframe the viewport only for a genuinely new/switched graph, never for
    // an incremental node expansion (merge) - an unprompted re-center while
    // expanding, or on an unrelated resize/rejected update, is disorienting.
    if (!merge) await this.engine.fit?.();
    this.#setEmptyState(this.graph.records.length === 0);
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
    this.source = { type: "dataset", datasetId: Number(id) };
    return this.load({ query, internal: true, remember: false });
  }

  /** Restore the most recently remembered Filtered Result query, locally. */
  activateCurrentResults() {
    this.config.datasetId = null;
    this.config.datasetTitle = null;
    return this.load({
      query: this.currentResultsQuery,
      internal: true,
      remember: false,
    });
  }

  /**
   * Apply a saved Filter as a new search, matching heurist-data: hosted mode
   * triggers the global ON_REC_SEARCHSTART event through the host bridge (so
   * every realm-matching widget - including this one, once the host echoes
   * the search result back - stays in sync); standalone mode runs the
   * search internally by loading the filter's query directly.
   */
  async activateFilter(filter) {
    this.config.datasetId = null;
    this.config.datasetTitle = null;
    this.source = null;
    const query = filter?.query ?? filter;
    if (query == null || query === "") return this.getState();
    if (this.host?.supportsSearch?.()) {
      const { createFilterSearchRequest } = await import(
        "../data/FilterSearchRequest.js"
      );
      const request = createFilterSearchRequest(filter, {
        searchRealm: this.config.searchRealm,
        source: this.config.sourceId || null,
      });
      await this.host.doSearch(request);
      return this.getState();
    }
    return this.load({ query });
  }

  /** Load per-record popup content from the configured presentation template. */
  async requestPopupContent({ recordId, signal } = {}) {
    const template = this.config.engineOptions?.popupTemplate;
    if (!template || !this.recordContentProvider) return null;
    const id = Number(recordId);
    if (!Number.isInteger(id) || id < 1) return null;
    const content = await this.recordContentProvider.load({
      records: [{ rec_ID: id }],
      template,
      signal,
    });
    return content.get(id) ?? content.get(String(id)) ?? null;
  }

  /**
   * Apply settings edited in the configuration dialog to the running
   * application, matching heurist-data's `DataApplication.applyConfiguration()`:
   * push the renderer-facing options into the live engine and re-render the
   * current graph, and let `GraphControlPanel` react to the UI-facing options
   * through the dispatched event, instead of only ever taking effect on the
   * next full reload.
   */
  async applyConfiguration(value) {
    const { normalizeGraphConfigurationSettings } = await import(
      "../ui/config/graphConfigurationSchema.js"
    );
    const normalized = normalizeGraphConfigurationSettings(value);
    const defaults = normalized.config.defaults;
    this.config.persistedSettings = normalized;
    this.config.ui = normalized.options.ui;
    this.config.limits = {
      ...this.config.limits,
      maxNodes: Number(defaults.maxNodes) || this.config.limits.maxNodes,
      maxEdges: Number(defaults.maxEdges) || this.config.limits.maxEdges,
    };
    this.config.engineOptions = {
      ...this.config.engineOptions,
      gravity: defaults.gravity,
      scaling: defaults.scaling,
      labelMaxLength: defaults.labelLength,
      popupDelay: defaults.popupDelay,
      popupTemplate: defaults.popupTemplate,
      selectionEnabled: normalized.options.interaction.selectionEnabled,
      popupEnabled: normalized.options.interaction.popupEnabled,
    };
    await this.engine.applyConfiguration?.(this.config.engineOptions);
    // Gravity/scaling/label length only take effect on vis-network through a
    // fresh render (scaling recomputes each node's `value`, labels are
    // re-truncated); re-render the graph already on screen instead of
    // waiting for the next load()/expandNode().
    await this.#renderVisible();
    this.dispatch("heurist-graph-configuration-changed", {
      options: normalized.options,
      config: normalized.config,
    });
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

  /** Hide the vis-network canvas and show the configured empty-result message. */
  #setEmptyState(empty) {
    if (this.canvasElement) this.canvasElement.hidden = empty;
    if (!this.messageElement) return;
    this.messageElement.hidden = !empty;
    if (empty) {
      this.messageElement.textContent =
        this.config.persistedSettings?.config?.defaults?.emptyResultMessage ||
        "No records";
    }
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

  dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
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
