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

export class VisNetworkAdapter extends GraphEngineAdapter {
  async initialize({
    container,
    options = {},
    onSelectionChange,
    onNodeActivate,
  } = {}) {
    this.container = container;
    this.options = options;
    this.onSelectionChange = onSelectionChange;
    this.onNodeActivate = onNodeActivate;
    this.nodes = new DataSet();
    this.edges = new DataSet();
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
  }

  async setGraph(graph) {
    this.nodes.clear();
    this.edges.clear();
    return this.mergeGraph(graph);
  }

  async mergeGraph(graph) {
    this.nodes.update(
      graph.records.map((record) => ({
        id: record.id,
        label: record.title || `Record ${record.id}`,
        group: record.recordTypeId || "unknown",
        title: record.title || `Record ${record.id}`,
      })),
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
    this.network?.selectNodes(recordIds.map(Number), false);
  }

  async fit() {
    this.network?.fit({ animation: true });
  }

  async resize() {
    this.network?.redraw();
    this.network?.fit({ animation: false });
  }

  async destroy() {
    this.network?.destroy();
    this.network = null;
    this.nodes = null;
    this.edges = null;
  }
}

function networkOptions(options) {
  return {
    autoResize: true,
    physics: options.physics !== false,
    interaction: {
      hover: true,
      navigationButtons: true,
      ...options.interaction,
    },
    nodes: { shape: "dot", size: 18, font: { size: 13 }, ...options.nodes },
    edges: { smooth: true, color: "#8b9aaa", ...options.edges },
    layout: { improvedLayout: true, ...options.layout },
  };
}
