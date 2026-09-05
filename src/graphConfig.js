/**
 * @file graphConfig.js
 * @brief Bootstrap normalization for heurist-graph.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
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
import { normalizeDataConfigurationSettings } from "./ui/config/graphConfigurationSchema.js";

export function getHeuristGraphConfig() {
  const bridge = getFrameHostBridge("heuristGraphHost");
  const bootstrap = resolveModuleBootstrap({
    bridge,
    standalone: getGlobalBootstrap("heuristModuleBootstrap"),
  });
  const runtime = bootstrap.runtime || {};
  const settings = bootstrap.settings || {};
  const hasPersistedSettings = Boolean(
    settings?.format || settings?.options || settings?.config,
  );
  const persistedSettings = normalizeDataConfigurationSettings(settings);
  const source = bootstrap.source || bootstrap.state || {};
  const language = String(runtime.language || "eng").slice(0, 3).toLowerCase();
  return {
    containerId: "heurist-graph",
    database: runtime.database || null,
    apiBaseUrl: runtime.apiBaseUrl || null,
    accessToken: runtime.accessToken || null,
    requestHeaders: runtime.requestHeaders || {},
    language: /^[a-z]{3}$/.test(language) ? language : "eng",
    localeBaseUrl: runtime.localeBaseUrl || runtime.moduleBaseUrl || null,
    host: runtime.baseUrl
      ? {
          type: "heurist",
          baseUrl: runtime.baseUrl,
          database: runtime.database || null,
          bridge,
        }
      : null,
    searchRealm: runtime.searchRealm ?? runtime.search_realm ?? null,
    sourceId: runtime.source ?? runtime.sourceId ?? null,
    query: source.query ?? null,
    rules: settings.rules ?? source.rules ?? [],
    links: normalizeLinks(settings.links ?? source.links),
    fields: normalizeFields(settings.fields ?? source.fields),
    limits: normalizeLimits({
      ...settings.limits,
      maxNodes: persistedSettings.config.defaults.maxNodes,
      maxEdges: persistedSettings.config.defaults.maxEdges,
    }),
    selection: normalizeIds(source.selection),
    engine: settings.engine || "vis-network",
    engineOptions: {
      ...settings.engineOptions,
      gravity: persistedSettings.config.defaults.gravity,
      scaling: persistedSettings.config.defaults.scaling,
      labelMaxLength: persistedSettings.config.defaults.labelLength,
      popupDelay: persistedSettings.config.defaults.popupDelay,
      popupTemplate: persistedSettings.config.defaults.popupTemplate,
    },
    persistedSettings,
    loadPreferencesOnInit:
      !hasPersistedSettings &&
      !["website", "publish", "published"].includes(
        String(runtime.runtimeMode || "").toLowerCase(),
      ),
  };
}

function normalizeLinks(value) {
  if (value == null || value === "") return "all";
  const values = Array.isArray(value) ? value : String(value).split(",");
  const specs = [
    ...new Set(values.map((spec) => String(spec).trim()).filter(Boolean)),
  ];
  if (!specs.length || specs.some((spec) => spec.toLowerCase() === "all"))
    return "all";
  return specs;
}

function normalizeFields(value) {
  if (value == null || value === "") return ["rec_Title", "rec_RecTypeID"];
  const values = Array.isArray(value) ? value : String(value).split(",");
  return [
    ...new Set(values.map((field) => String(field).trim()).filter(Boolean)),
  ];
}

function normalizeIds(value) {
  const values = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      values.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
}

function normalizeLimits(value = {}) {
  return {
    maxNodes: positiveLimit(value.maxNodes, 5000),
    maxEdges: positiveLimit(value.maxEdges, 10000),
    maxDepth: positiveLimit(value.maxDepth, 5),
  };
}

function positiveLimit(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
