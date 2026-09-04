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
    pathId: null,
    raw: { source: 1, target: 2, field: 240 },
  });
});

test("GraphProvider sends the documented graph request", async () => {
  let request;
  const provider = new GraphProvider({
    apiClient: {
      post: async (path, options) => {
        request = { path, options };
        return {
          ids: [1],
          total: 1,
          graph: { records: [], edges: [], paths: {} },
        };
      },
    },
  });
  await provider.load({ query: "t:10", rules: [{ query: [] }] });
  assert.equal(request.path, "/records");
  assert.deepEqual(request.options.body, {
    query: "t:10",
    detail: "graph",
    rules: [{ query: [] }],
    fields: ["rec_Title", "rec_RecTypeID"],
    limit: 100,
    offset: 0,
  });
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
    config: { query: "t:10", rules: [], fields: [], selection: [] },
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
  assert.deepEqual(calls[1].query, { ids: [1] });
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
