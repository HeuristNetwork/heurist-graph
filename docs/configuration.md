# Heurist Graph Configuration

The module accepts a serializable bootstrap envelope. Standalone pages provide
it through `window.heuristModuleBootstrap`; embedded pages provide it through
the `heuristGraphHost` iframe bridge.

```js
window.heuristModuleBootstrap = {
  runtime: {
    database: "demo",
    apiBaseUrl: "/heurist/api",
    runtimeMode: "standalone",
    language: "eng"
  },
  settings: {
    engine: "vis-network",
    fields: ["rec_Title", "rec_RecTypeID"],
    rules: [],
    limits: {
      maxNodes: 5000,
      maxEdges: 10000,
      maxDepth: 5
    },
    engineOptions: {
      physics: true
    }
  },
  source: {
    query: "t:10",
    selection: []
  }
};
```

## Runtime values

- `runtime.database` identifies the Heurist database;
- `runtime.apiBaseUrl` points to the API root;
- `runtime.accessToken` and `runtime.requestHeaders` carry optional authentication;
- `runtime.baseUrl` identifies an embedded Heurist host;
- `runtime.source` identifies the module instance for host coordination;
- `source.query` is the top-level Heurist query;
- `source.selection` contains initially selected record IDs.

## Graph request

`GraphProvider` sends a POST request to `/records` with `detail: "graph"`.
The request contains the top query, configured expansion rules, requested graph
headers, and pagination values. The API response is expected to contain
`ids`, `total`, and a renderer-neutral `graph` object with `records`, `edges`,
and `paths`.

The server currently owns expansion execution. Client-side dynamic expansion
reuses the configured rules and sends an IDs query for the selected node. The
returned records and edges are merged into the current graph.

## Engine options

`engine` currently supports `vis-network`. Its options are passed to the
adapter and may contain `physics`, `interaction`, `nodes`, `edges`, and `layout`
objects. These values are renderer-specific and must remain inside the engine
adapter boundary.

## Public API

The child exposes `window.heuristGraph`:

- `load({ query, rules, merge })` loads or merges a graph;
- `expandNode(recordId)` requests a dynamic expansion;
- `setSelection(recordIds)` updates selected records;
- `clearSelection()` clears selection;
- `getState()` returns query, selection, and graph record IDs;
- `resize()` refreshes the renderer;
- `addEventListener()` and `removeEventListener()` subscribe to module events;
- `destroy()` tears down the application.

The `heurist-graph-selection-changed` event is emitted for both host-driven and
renderer-driven selection changes. The embedded host wrapper forwards renderer
selection to the legacy `onselect` callback.

## Current scope

The first implementation is configuration-driven. A visual expansion-rules
builder, graph publication settings, graph export, path-aware styling, and
server-enforced node/edge/depth limits remain follow-up work. They should be
added without coupling the API or application layer to `vis-network`.
