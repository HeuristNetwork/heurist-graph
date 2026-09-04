/**
 * @file dataConfig.js
 * @brief Bootstrap normalization for heurist-data.
 * @project     Heurist academic knowledge management system
 * @package     heurist-data
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */
import {
  getFrameHostBridge,
  getGlobalBootstrap,
} from "@heurist/client-core/host";
import { resolveModuleBootstrap } from "@heurist/client-core/config";
import { normalizeDataConfigurationSettings } from "./ui/config/dataConfigurationSchema.js";

export function getHeuristDataConfig() {
  const bridge = getFrameHostBridge("heuristDataHost");
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap("heuristModuleBootstrap"),
  });
  const runtime = bootstrap.runtime;
  const settings = bootstrap.settings;
  const hasPersistedSettings = Boolean(
    settings?.format || settings?.options || settings?.config,
  );
  const persistedSettings = normalizeDataConfigurationSettings(settings);
  const configuredLanguage = persistedSettings.options.ui.language;
  const language = normalizeLanguage(
    runtime.language ||
      (configuredLanguage !== "auto" ? configuredLanguage : null),
  );
  // Publications store the module snapshot under the shared `state` member;
  // retain `source` for embedded host bootstraps created before publication.
  const source = bootstrap.source ?? bootstrap.state ?? {};
  const runtimeDatasetId = positiveId(source.datasetId ?? source.dataset);
  const runtimeQuery =
    source.query == null || source.query === "" ? null : source.query;
  const configuredDatasetId =
    persistedSettings.options.datasets.initiallyActive;
  const initialDatasetId =
    runtimeDatasetId || (runtimeQuery == null ? configuredDatasetId : null);
  const initialQuery =
    runtimeQuery ??
    (initialDatasetId == null
      ? persistedSettings.config.currentResults.initialQuery
      : null);
  const readonly =
    runtime.readonly === true ||
    persistedSettings.options.interaction.readonly === true;
  const interaction = {
    ...persistedSettings.options.interaction,
    ...(readonly ? { editEnabled: false } : {}),
  };
  return {
    containerId: "heurist-data",
    viewerMode:
      runtime.viewerMode === "configuration" ? "configuration" : "data",
    runtimeMode: runtime.runtimeMode || "standalone",
    readonly,
    language,
    searchRealm: runtime.searchRealm ?? runtime.search_realm ?? null,
    sourceId: runtime.source ?? runtime.sourceId ?? null,
    localeBaseUrl: runtime.localeBaseUrl || runtime.moduleBaseUrl || null,
    database: runtime.database || null,
    apiBaseUrl: runtime.apiBaseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    engine:
      settings.engine === "recordlist" ||
      persistedSettings.config.defaults.engine === "recordlist"
        ? "recordlist"
        : "datatables",
    engineOptions: {
      baseUrl: runtime.baseUrl || null,
      database: runtime.database || null,
      pageLength: persistedSettings.config.defaults.pageSize,
      ...persistedSettings.config.defaults,
      viewMode:
        source.viewMode ||
        settings.viewMode ||
        persistedSettings.config.defaults.viewMode,
      initialOffset: Math.max(0, Number(source.pagination?.offset) || 0),
      controls: persistedSettings.options.nativeControls,
      interaction,
    },
    persistedSettings,
    loadPreferencesOnInit:
      !hasPersistedSettings &&
      !["website", "publish", "published"].includes(
        String(runtime.runtimeMode || "").toLowerCase(),
      ),
    ui: persistedSettings.options.ui,
    source: {
      datasetId: initialDatasetId,
      query: initialQuery,
      fields: Array.isArray(source.fields) ? source.fields : [],
      selection: normalizeIds(source.selection),
      pagination: normalizePagination(source.pagination),
    },
    host: runtime.baseUrl
      ? {
          type: "heurist",
          baseUrl: runtime.baseUrl,
          database: runtime.database,
          bridge,
        }
      : null,
  };
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
function normalizeIds(value) {
  return (Array.isArray(value) ? value : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}
function normalizeLanguage(value) {
  const language = String(value || "eng")
    .trim()
    .toLowerCase()
    .slice(0, 3);
  return /^[a-z]{3}$/.test(language) && language !== "aut" ? language : "eng";
}
function normalizePagination(value) {
  const offset = Math.max(0, Number(value?.offset) || 0);
  const limit = Math.max(0, Number(value?.limit) || 0);
  return offset || limit ? { offset, limit } : null;
}
