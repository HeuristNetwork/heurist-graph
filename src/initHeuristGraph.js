/**
 * @file initHeuristGraph.js
 * @brief Initializes the heurist-graph application.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { HeuristApiClient } from "@heurist/client-core/api";
import { GraphApplication } from "./core/GraphApplication.js";
import { GraphProvider } from "./data/GraphProvider.js";
import { createGraphEngine } from "./engine/createGraphEngine.js";
import { HeuristGraphPublicApi } from "./host/HeuristGraphPublicApi.js";
import { GraphControlPanel } from "./ui/GraphControlPanel.js";
import { createHostAdapter } from "./host/createHostAdapter.js";
import { RecordTypeProvider } from "./data/RecordTypeProvider.js";
import { DatasetListProvider } from "./data/DatasetListProvider.js";
import { DatasetProvider } from "./data/DatasetProvider.js";
import { FilterProvider } from "./data/FilterProvider.js";
import { DataConfigurationDialog } from "./ui/config/DataConfigurationDialog.js";

export async function initHeuristGraph(config) {
  const container = document.getElementById(config.containerId);
  if (!container)
    throw new Error(`Graph container #${config.containerId} was not found`);
  const apiClient = new HeuristApiClient({
    apiBaseUrl: config.apiBaseUrl,
    database: config.database,
    accessToken: config.accessToken,
    headers: config.requestHeaders,
  });
  const application = new GraphApplication({
    config,
    provider: new GraphProvider({ apiClient }),
    engine: createGraphEngine(config.engine),
    host: createHostAdapter(config.host),
    datasetProvider: new DatasetProvider({ apiClient }),
  });
  const api = new HeuristGraphPublicApi(application);
  const canvas = document.createElement("div");
  canvas.className = "heurist-graph-canvas";
  container.replaceChildren(canvas);
  const recordTypes = new RecordTypeProvider({ apiClient });
  const datasetListProvider = new DatasetListProvider({ apiClient, recordTypes });
  const filterListProvider = new FilterProvider({ apiClient });
  api.setConfigurationDialogFactory((options = {}) => new DataConfigurationDialog({
    ...options,
    datasetListProvider,
    filterListProvider,
  }).open());
  const ready = application.initialize(canvas).then(async () => {
    await new GraphControlPanel({
      api,
      container,
      datasetListProvider,
      datasetProvider: new DatasetProvider({ apiClient }),
      filterListProvider,
    }).mount();
    return api;
  });
  api.setReadyPromise(ready);
  globalThis.heuristGraph = api;
  return ready;
}
