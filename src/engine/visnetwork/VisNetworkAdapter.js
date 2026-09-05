/**
 * @file VisNetworkAdapter.js
 * @brief vis-network implementation of the graph engine contract.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { DataSet, Network } from "vis-network/standalone";
import { GraphEngineAdapter } from "../GraphEngineAdapter.js";

/** Default label length; longer titles are truncated with an ellipsis. */
const DEFAULT_LABEL_MAX_LENGTH = 40;

/** "Gravity" presets shown in the settings dialog, in vis-network terms. */
const GRAVITY_PRESETS = { loose: -4000, normal: -2000, tight: -800 };

export class VisNetworkAdapter extends GraphEngineAdapter {
  async initialize({
    container,
    options = {},
    onSelectionChange,
    onNodeActivate,
    onPopupContentRequest,
  } = {}) {
    this.container = container;
    this.options = options;
    this.onSelectionChange = onSelectionChange;
    this.onNodeActivate = onNodeActivate;
    this.onPopupContentRequest = onPopupContentRequest;
    this.nodes = new DataSet();
    this.edges = new DataSet();
    this.popup = null;
    this.popupGeneration = 0;
    this.popupAbortController = null;
    if (this.container && this.container.style && !this.container.style.position) {
      this.container.style.position = "relative";
    }
    this.network = new Network(
      container,
      { nodes: this.nodes, edges: this.edges },
      networkOptions(options),
    );
    this.network.on("doubleClick", ({ nodes }) => {
      if (nodes.length) this.onNodeActivate?.(Number(nodes[0]));
    });
    this.network.on("select", ({ nodes }) =>
      this.onSelectionChange?.(nodes.map(Number)),
    );
    this.network.on("click", ({ nodes, pointer }) => {
      if (nodes.length) this.#showPopup(nodes[0], pointer.DOM);
      else this.#hidePopup();
    });
    this.network.on("dragStart", () => this.#hidePopup());
    this.network.on("zoom", () => this.#hidePopup());
  }

  async setGraph(graph) {
    this.nodes.clear();
    this.edges.clear();
    return this.mergeGraph(graph);
  }

  async mergeGraph(graph) {
    const maxLength =
      Number(this.options?.labelMaxLength) || DEFAULT_LABEL_MAX_LENGTH;
    const scalingEnabled = this.options?.scaling !== false;
    // vis-network only scales a node's size by its `value` field, computed
    // here as its connection count; the full (already-merged) graph is
    // supplied on every call, so degree is recomputed fresh each time.
    const degree = new Map();
    if (scalingEnabled) {
      for (const edge of graph.edges) {
        degree.set(edge.from, (degree.get(edge.from) || 0) + 1);
        degree.set(edge.to, (degree.get(edge.to) || 0) + 1);
      }
    }
    this.nodes.update(
      graph.records.map((record) => {
        const title = stripHtmlTags(record.title) || `Record ${record.id}`;
        const node = {
          id: record.id,
          label: truncateLabel(title, maxLength),
          group: record.recordTypeId || "unknown",
          // Full (tag-stripped) text: vis-network's built-in hover tooltip.
          title,
          recordTypeId: record.recordTypeId || null,
        };
        if (scalingEnabled) node.value = degree.get(record.id) || 0;
        return node;
      }),
    );
    this.edges.update(
      graph.edges.map((edge) => ({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        label: edge.fieldId ? String(edge.fieldId) : undefined,
        arrows: "to",
        // Provenance carried through for legend grouping and edge styling.
        link: edge.link || undefined,
        path: edge.path || undefined,
      })),
    );
  }

  async setSelection(recordIds) {
    if (!this.network || !this.nodes) return;
    // A selection driven by another widget's ON_REC_SELECT event may name
    // records this graph never loaded; vis-network throws for unknown node
    // ids, so only select the subset actually present.
    const ids = recordIds
      .map(Number)
      .filter((id) => this.nodes.get(id) != null);
    this.network.selectNodes(ids, false);
  }

  async fit() {
    this.network?.fit({ animation: true });
  }

  async resize() {
    // autoResize (set in networkOptions) already recalculates the canvas
    // size on its own; redraw() alone repaints at that size without forcing
    // a zoom-to-extent, which would jarringly reframe the view on every
    // unrelated layout resize (e.g. a sidebar toggle, or another widget's
    // search finishing). Use fit() explicitly when a reframe is wanted.
    this.network?.redraw();
  }

  async destroy() {
    this.#hidePopup();
    this.popupAbortController?.abort();
    this.popup?.remove();
    this.popup = null;
    this.network?.destroy();
    this.network = null;
    this.nodes = null;
    this.edges = null;
  }

  /**
   * Show a custom popup for one node, positioned at its on-screen coordinates.
   *
   * vis-network's own `title` option only supports a hover tooltip (a plain
   * string or a DOM element vis-network inserts as-is - no built-in click
   * popup). A richer, click-triggered popup is built here instead.
   *
   * Content resolution, in order: `options.popupTemplate` (a Heurist report
   * template name, the same mechanism HRecordList uses for custom card/view
   * templates) fetched through `onPopupContentRequest` as server-rendered
   * HTML; else `options.popupRenderer(node)` for a caller-supplied DOM node;
   * else a small built-in title/type card. Set `options.customPopup: false`
   * to disable the click popup entirely and keep only the hover tooltip.
   */
  #showPopup(nodeId, position) {
    if (this.options?.customPopup === false) return;
    const node = this.nodes?.get(nodeId);
    if (!node || !this.container) return;
    if (!this.popup) {
      this.popup = document.createElement("div");
      this.popup.className = "heurist-graph-popup";
      this.popup.hidden = true;
      this.container.appendChild(this.popup);
    }
    this.popupGeneration += 1;
    const generation = this.popupGeneration;
    this.popup.style.left = `${position.x}px`;
    this.popup.style.top = `${position.y}px`;
    this.popup.hidden = false;

    const template = this.options?.popupTemplate;
    if (template && typeof this.onPopupContentRequest === "function") {
      this.popup.replaceChildren(popupPlaceholderContent());
      this.popupAbortController?.abort();
      this.popupAbortController = new AbortController();
      Promise.resolve(
        this.onPopupContentRequest({
          recordId: nodeId,
          signal: this.popupAbortController.signal,
        }),
      )
        .then((html) => {
          if (generation !== this.popupGeneration || this.popup.hidden) return;
          if (html == null) this.popup.replaceChildren(this.#renderPopupContent(node));
          else this.popup.innerHTML = String(html);
        })
        .catch(() => {
          if (generation !== this.popupGeneration || this.popup.hidden) return;
          this.popup.replaceChildren(this.#renderPopupContent(node));
        });
      return;
    }
    this.popup.replaceChildren(this.#renderPopupContent(node));
  }

  #renderPopupContent(node) {
    const content =
      typeof this.options?.popupRenderer === "function"
        ? this.options.popupRenderer(node)
        : null;
    return content instanceof Node ? content : defaultPopupContent(node);
  }

  #hidePopup() {
    if (this.popup) this.popup.hidden = true;
    // Invalidate any in-flight popup content fetch so a slow response can
    // never overwrite a popup opened for a different node afterward.
    this.popupGeneration += 1;
    this.popupAbortController?.abort();
  }
}

/** Remove markup from a record title, collapsing the remaining whitespace. */
function stripHtmlTags(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate a label to `maxLength` characters, keeping whole words where possible. */
function truncateLabel(text, maxLength) {
  if (!maxLength || text.length <= maxLength) return text;
  const cut = text.slice(0, Math.max(1, maxLength - 1));
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trimEnd()}…`;
}

function defaultPopupContent(node) {
  const fragment = document.createDocumentFragment();
  const title = document.createElement("div");
  title.className = "heurist-graph-popup-title";
  title.textContent = node.title || node.label || `Record ${node.id}`;
  fragment.append(title);
  const meta = document.createElement("div");
  meta.className = "heurist-graph-popup-meta";
  meta.textContent = node.recordTypeId
    ? `Record ${node.id} · Type ${node.recordTypeId}`
    : `Record ${node.id}`;
  fragment.append(meta);
  return fragment;
}

function popupPlaceholderContent() {
  const span = document.createElement("span");
  span.className = "heurist-graph-popup-loading";
  span.textContent = "…";
  return span;
}

function networkOptions(options) {
  const physicsOverride = options.physics;
  const scalingEnabled = options.scaling !== false;
  const popupDelaySeconds = Number(options.popupDelay);
  return {
    autoResize: true,
    physics:
      physicsOverride === false
        ? false
        : {
            solver: "barnesHut",
            barnesHut: {
              // "Gravity": a stronger (more negative) gravitationalConstant
              // spreads nodes further apart; centralGravity pulls the whole
              // graph back toward the center so it doesn't drift off-canvas.
              gravitationalConstant:
                GRAVITY_PRESETS[options.gravity] ?? GRAVITY_PRESETS.normal,
              centralGravity: 0.3,
              springLength: 120,
              springConstant: 0.04,
              damping: 0.09,
              avoidOverlap: 0.1,
            },
            // Fitting the viewport on every stabilization pass (vis-network's
            // own default) re-centers the view on any data churn - including
            // an unrelated resize/redraw - which is disorienting. GraphApplication
            // calls fit() explicitly only for a genuinely new/switched graph.
            stabilization: { enabled: true, iterations: 200, fit: false },
            ...(physicsOverride && typeof physicsOverride === "object"
              ? physicsOverride
              : {}),
          },
    interaction: {
      hover: true,
      navigationButtons: true,
      keyboard: { enabled: true, bindToWindow: false },
      multiselect: true,
      tooltipDelay: popupDelaySeconds > 0 ? popupDelaySeconds * 1000 : 1000,
      hideEdgesOnDrag: false,
      ...options.interaction,
    },
    nodes: {
      shape: "dot",
      size: 18,
      font: { size: 13, face: "Arial" },
      borderWidth: 1,
      borderWidthSelected: 3,
      shadow: false,
      ...(scalingEnabled ? { scaling: { min: 10, max: 30 } } : {}),
      ...options.nodes,
    },
    edges: {
      smooth: { type: "dynamic" },
      color: { color: "#8b9aaa", highlight: "#3762a6", hover: "#5a80b8" },
      width: 1,
      selectionWidth: 2,
      arrows: { to: { enabled: true, scaleFactor: 0.6 } },
      font: { size: 11, align: "middle" },
      ...options.edges,
    },
    layout: {
      improvedLayout: true,
      ...options.layout,
    },
    ...(options.groups ? { groups: options.groups } : {}),
  };
}
