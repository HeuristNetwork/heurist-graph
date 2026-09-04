# Heurist Graph

Standalone and embeddable graph presentation module for Heurist. The module
uses the renderer-neutral `detail=graph` records API and renders it with
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
    rules: [],
    fields: ["rec_Title", "rec_RecTypeID"]
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

Requests use `POST /api/{database}/records` with `detail: "graph"`, a top-level
query, expansion rules, and requested headers. The server response remains
renderer-neutral. The `VisNetworkAdapter` converts `graph.records` and
`graph.edges` into the vis-network node and edge collections.

Double-clicking a node requests another bounded graph expansion and merges the
returned records and edges by stable IDs.

The initial module accepts expansion rules through the bootstrap/settings
envelope. A visual rules editor will be added after the graph request and
selection contracts have been adopted by the host.

## Host integration

The legacy host adapter is available under
`heurist/hclient/modules/graph/HeuristModuleGraph.js` and follows the shared
`HeuristModuleViewer` and `HeuristModuleRecordset` lifecycle.
