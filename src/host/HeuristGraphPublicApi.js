/**
 * @file HeuristGraphPublicApi.js
 * @brief Stable public API for heurist-graph host integrations.
 * @project     Heurist academic knowledge management system
 * @package     heurist-graph
 * @link        https://HeuristNetwork.org
 * @copyright   (C) 2024 onwards Heurist Network
 * @author      Artem Osmakov   <osmakov@gmail.com>
 * @author      Ian Johnson <ian.johnson.heurist@gmail.com>
 * @license     https://www.gnu.org/licenses/gpl-3.0.txt GNU License 3.0
 * @since       8.0
 */

import { serializeGraphConfigurationSettings } from "../ui/config/graphConfigurationSchema.js";

export class HeuristGraphPublicApi {
  constructor(application) {
    this.application = application;
    this.readyPromise = null;
    this.configurationDialogFactory = null;
  }

  setReadyPromise(promise) {
    this.readyPromise = promise;
  }

  ready() {
    return this.readyPromise || Promise.resolve(this);
  }

  setConfigurationDialogFactory(factory) {
    this.configurationDialogFactory = typeof factory === "function" ? factory : null;
  }

  async openPreferencesDialog(options = {}) {
    if (!this.configurationDialogFactory) throw new Error("Graph configuration dialog is not available");
    const saved = (await this.application.host.loadPreferences?.()) ?? null;
    return this.configurationDialogFactory({ ...options, mode: "graph", value: saved || this.application.config.persistedSettings || {}, onSave: async (value, context) => {
      const result = await this.application.host.savePreferences?.(
        serializeGraphConfigurationSettings(value),
      );
      this.application.applyConfiguration(context.serialized);
      return options.onSave?.(value, context, result) ?? result;
    } });
  }

  openPublishDialog(options = {}) {
    if (!this.configurationDialogFactory) throw new Error("Graph configuration dialog is not available");
    return this.configurationDialogFactory({ ...options, mode: "publish", value: this.application.config.persistedSettings || {}, onSave: async (value, context) => {
      const result = await this.application.host.publish?.({ format: "heurist-publication", version: 1, options: context.serialized.options, config: context.serialized.config, state: this.getState() });
      return options.onSave?.(value, context, result) ?? result;
    } });
  }

  load(options) {
    return this.application.load(options);
  }

  setDataset(id) {
    return this.application.setDataset(id);
  }

  activateCurrentResults() {
    return this.application.activateCurrentResults();
  }

  activateFilter(filter) {
    return this.application.activateFilter(filter);
  }

  fit() {
    return this.application.engine.fit();
  }

  exportGephi() {
    return this.application.exportGephi?.();
  }

  expandNode(recordId) {
    return this.application.expandNode(recordId);
  }

  getLegend() {
    return this.application.getLegend();
  }

  setRelationshipVisibility(key, ids, visible) {
    return this.application.setRelationshipVisibility(key, ids, visible);
  }

  getVocabulary() {
    return this.application.getVocabulary();
  }

  setRecordTypeVisibility(recordTypeId, visible) {
    return this.application.setRecordTypeVisibility(recordTypeId, visible);
  }

  setLinkVisibility(key, visible) {
    return this.application.setLinkVisibility(key, visible);
  }

  setSelection(recordIds, options) {
    return this.application.setSelection(recordIds, options);
  }

  clearSelection() {
    return this.application.clearSelection();
  }

  getState() {
    return this.application.getState();
  }

  resize() {
    return this.application.resize();
  }

  addEventListener(...args) {
    return this.application.addEventListener(...args);
  }

  removeEventListener(...args) {
    return this.application.removeEventListener(...args);
  }

  destroy() {
    return this.application.destroy();
  }
}
