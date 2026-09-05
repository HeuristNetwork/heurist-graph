# Heurist Graph

Standalone and embeddable graph presentation module for Heurist. The module
uses the renderer-neutral `/api/{database}/graph` endpoint and renders it with
`vis-network`.

## Development

```bash
npm install
npm test
npm run build
npm run dev
```

## Bootstrap

Standalone pages define `window.heuristModuleBootstrap`:

```js
window.heuristModuleBootstrap = {
  runtime: {
    database: "demo",
    apiBaseUrl: "/heurist/api",
    runtimeMode: "standalone"
  },
  settings: {
    links: "all",
    limits: { maxNodes: 5000, maxEdges: 10000, maxDepth: 5 }
  },
  source: {
    query: "t:10",
    selection: []
  }
};
```

The child application exposes `window.heuristGraph` with `load`,
`expandNode`, `setSelection`, `clearSelection`, `getState`, `resize`, and
event subscription methods.

## Graph contract

Requests use `POST /api/{database}/graph` with a top-level query, an
internal-edge selection (`links`), pagination, and an optional `limits` budget.
`links` is `"all"` for the initial graph and a Saved Filter, or an array of
compact link specs for a Dataset. The response is renderer-neutral: `graph`
holds `records` (always `rec_ID`, `rec_Title`, `rec_RecTypeID`), provenance-
tagged `edges`, the `links`/`paths` namespaces, and an effective `limits`
report. The `VisNetworkAdapter` converts `graph.records` and `graph.edges` into
the vis-network node and edge collections.

Double-clicking a node requests an IDs-query graph with no link discovery and
merges the returned records and edges by stable IDs.

Individual interactive expansion rules and their visual builder are follow-up
work, layered on the same endpoint once the request and selection contracts are
adopted by the host.

## Host integration

The legacy host adapter is available under
`heurist/hclient/modules/graph/HeuristModuleGraph.js` and follows the shared
`HeuristModuleViewer` and `HeuristModuleRecordset` lifecycle.
