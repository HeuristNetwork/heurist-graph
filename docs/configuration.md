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
    links: "all",
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

`GraphProvider` sends a POST request to `/graph`. The request body contains the
top query, the internal-edge selection (`links`), pagination values, and an
optional `limits` budget. The API response is a renderer-neutral document with
`query`, `total`, `offset`, `limit`, and a `graph` object holding `records`,
`edges`, `links`, `paths`, and `limits`.

`links` defaults to `"all"` (discover every edge whose two endpoints are both in
the result set) for the initial graph and for a Saved Filter. A Dataset with an
explicit compact link list sends that array instead. Client-side dynamic
expansion sends an IDs query with no link discovery and merges the returned
records and edges into the current graph by stable ID.

## Engine options

`engine` currently supports `vis-network`. Its options are passed to the
adapter and may contain `physics`, `interaction`, `nodes`, `edges`, and `layout`
objects. These values are renderer-specific and must remain inside the engine
adapter boundary.

## Public API

The child exposes `window.heuristGraph`:

- `load({ query, links, merge })` loads or merges a graph;
- `expandNode(recordId)` requests a dynamic expansion;
- `getLegend()` returns node counts by record type and edge counts by link group;
- `setRecordTypeVisibility(recordTypeId, visible)` and
  `setLinkVisibility(key, visible)` toggle legend groups without reloading;
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
