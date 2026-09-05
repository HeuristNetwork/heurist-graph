/**
 * @file graph.test.js
 * @brief Tests graph normalization, API requests, and application merging.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { GraphDocument } from "../src/core/GraphDocument.js";
import { GraphProvider } from "../src/data/GraphProvider.js";
import { GraphApplication } from "../src/core/GraphApplication.js";
import { HeuristGraphHostAdapter } from "../src/host/HeuristGraphHostAdapter.js";

function graphEnvelope(graph = {}) {
  return {
    query: "t:10",
    total: graph.total ?? 0,
    offset: 0,
    limit: 1000,
    graph: {
      records: graph.records || [],
      edges: graph.edges || [],
      links: graph.links || {},
      paths: graph.paths || {},
      limits: graph.limits || {
        maxNodes: 5000,
        maxEdges: 10000,
        maxDepth: 5,
        nodesReturned: (graph.records || []).length,
        edgesReturned: (graph.edges || []).length,
        truncated: false,
      },
    },
  };
}

test("GraphDocument normalizes legacy graph records and edges", () => {
  const graph = new GraphDocument({
    records: [{ rec_ID: 1, rec_RecTypeID: 10, rec_Title: "A" }],
    edges: [{ source: 1, target: 2, field: 240 }],
  });
  assert.deepEqual(graph.recordIds, [1]);
  assert.deepEqual(graph.edges[0], {
    id: "1:2:240:0",
    from: 1,
    to: 2,
    fieldId: 240,
    relationshipId: null,
    link: null,
    path: null,
    raw: { source: 1, target: 2, field: 240 },
  });
});

test("GraphDocument keeps edge link/path provenance and the links map", () => {
  const graph = new GraphDocument(
    graphEnvelope({
      records: [{ rec_ID: 1, rec_RecTypeID: 10, rec_Title: "A" }],
      edges: [
        {
          id: "1:2:240:0:l1",
          source: 1,
          target: 2,
          field: 240,
          relationship: null,
          link: "l1",
          path: null,
        },
        {
          id: "2:3:0:0:p1",
          source: 2,
          target: 3,
          field: null,
          relationship: null,
          link: null,
          path: "p1",
        },
      ],
      links: { l1: "10:lt240:48" },
      paths: { p1: "10:lt240:48:lt134:12" },
    }),
  );
  assert.deepEqual(graph.links, { l1: "10:lt240:48" });
  assert.deepEqual(graph.paths, { p1: "10:lt240:48:lt134:12" });
  assert.equal(graph.edges[0].link, "l1");
  assert.equal(graph.edges[0].path, null);
  assert.equal(graph.edges[1].link, null);
  assert.equal(graph.edges[1].path, "p1");
});

test("GraphProvider posts the dedicated graph request with links and limits", async () => {
  let request;
  const provider = new GraphProvider({
    apiClient: {
      post: async (path, options) => {
        request = { path, options };
        return graphEnvelope({ total: 1 });
      },
    },
  });
  const result = await provider.load({
    query: "t:10",
    links: "all",
    limits: { maxNodes: 10, maxEdges: 0, bogus: 5 },
  });
  assert.equal(request.path, "/graph");
  assert.deepEqual(request.options.body, {
    query: "t:10",
    limit: 1000,
    offset: 0,
    links: "all",
    limits: { maxNodes: 10 },
  });
  assert.equal(result.total, 1);
  assert.ok(result.graph instanceof GraphDocument);
});

test("GraphProvider forwards explicit link specs and omits empty selections", async () => {
  let body;
  const provider = new GraphProvider({
    apiClient: {
      post: async (_path, options) => {
        body = options.body;
        return graphEnvelope();
      },
    },
  });
  await provider.load({ query: "t:10", links: ["10:lt240:48", "10:lt240:48"] });
  assert.deepEqual(body.links, ["10:lt240:48"]);
  await provider.load({ query: "t:10", links: [] });
  assert.equal(Object.hasOwn(body, "links"), false);
});

test("GraphProvider rejects a response without a valid graph document", async () => {
  const provider = new GraphProvider({
    apiClient: { post: async () => ({ ids: [1], total: 1 }) },
  });
  await assert.rejects(
    () => provider.load({ query: "t:10" }),
    /missing a valid graph document/,
  );
});

test("GraphApplication loads and merges dynamic graph expansions", async () => {
  const calls = [];
  const graphs = [
    { records: [{ rec_ID: 1, rec_Title: "A" }], edges: [], paths: {} },
    {
      records: [{ rec_ID: 2, rec_Title: "B" }],
      edges: [{ source: 1, target: 2 }],
      paths: {},
    },
  ];
  let index = 0;
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: {
      load: async (request) => {
        calls.push(request);
        return { graph: new GraphDocument(graphs[index++]) };
      },
    },
    engine: {
      initialize: async () => {},
      setGraph: async (graph) => {
        assert.deepEqual(graph.recordIds, [1]);
      },
      mergeGraph: async (graph) => {
        assert.deepEqual(graph.recordIds, [1, 2]);
      },
      setSelection: async () => {},
      destroy: async () => {},
    },
    host: { initialize: async () => {}, destroy: async () => {} },
  });
  await application.initialize({});
  await application.expandNode(1);
  assert.equal(calls.length, 2);
  assert.deepEqual(application.getState().recordIds, [1, 2]);
  assert.deepEqual(calls[0].links, "all");
  assert.equal(calls[1].links, undefined);
  assert.deepEqual(calls[1].query, { ids: [1] });
});

test("GraphApplication builds a legend and hides record types and link groups", async () => {
  let rendered;
  const engine = {
    initialize: async () => {},
    setGraph: async (graph) => {
      rendered = graph;
    },
    mergeGraph: async (graph) => {
      rendered = graph;
    },
    setSelection: async () => {},
    destroy: async () => {},
  };
  const payload = graphEnvelope({
    records: [
      { rec_ID: 1, rec_RecTypeID: 10, rec_Title: "Person" },
      { rec_ID: 2, rec_RecTypeID: 12, rec_Title: "Event" },
    ],
    edges: [
      { id: "1:2:240:0:l1", source: 1, target: 2, field: 240, link: "l1" },
    ],
    links: { l1: "10:lt240:48" },
  });
  const application = new GraphApplication({
    config: { query: "t:10", selection: [], limits: {} },
    provider: { load: async () => ({ graph: new GraphDocument(payload) }) },
    engine,
    host: {},
  });
  await application.initialize({});

  const legend = application.getLegend();
  assert.deepEqual(
    legend.recordTypes.map((entry) => entry.recordTypeId).sort(),
    [10, 12],
  );
  assert.equal(legend.links[0].key, "link:l1");
  assert.equal(legend.links[0].spec, "10:lt240:48");
  assert.equal(legend.links[0].visible, true);

  await application.setRecordTypeVisibility(12, false);
  assert.deepEqual(rendered.recordIds, [1]);
  assert.equal(rendered.edges.length, 0);
  assert.equal(
    application.getLegend().recordTypes.find((e) => e.recordTypeId === 12)
      .visible,
    false,
  );

  await application.setRecordTypeVisibility(12, true);
  await application.setLinkVisibility("link:l1", false);
  assert.deepEqual(rendered.recordIds, [1, 2]);
  assert.equal(rendered.edges.length, 0);
});

test("HeuristGraphHostAdapter publishes selection through the bridge", async () => {
  let selection;
  const host = new HeuristGraphHostAdapter({
    bridge: {
      onSelection: (ids) => {
        selection = ids;
      },
    },
  });
  await host.initialize();
  host.publishSelection([3, 4]);
  assert.deepEqual(selection, [3, 4]);
});

test("GraphApplication emits selection changes from the graph engine", async () => {
  let engineSelection;
  let publishedSelection;
  const application = new GraphApplication({
    config: { selection: [] },
    provider: { load: async () => ({ graph: new GraphDocument() }) },
    engine: {
      initialize: async ({ onSelectionChange }) => {
        engineSelection = onSelectionChange;
      },
      setSelection: async () => {},
      destroy: async () => {},
    },
    host: {
      publishSelection: (ids) => {
        publishedSelection = ids;
      },
    },
  });
  let eventSelection;
  application.addEventListener("heurist-graph-selection-changed", (event) => {
    eventSelection = event.detail.recordIds;
  });
  await application.initialize({});
  await engineSelection([8]);
  assert.deepEqual(eventSelection, [8]);
  assert.deepEqual(publishedSelection, [8]);
});
