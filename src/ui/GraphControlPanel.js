/**
 * @file GraphControlPanel.js
 * @brief Graph controls using the heurist-data panel interaction pattern.
 */
import { GraphLegend } from "./GraphLegend.js";
import { GraphLegendEditor } from "./GraphLegendEditor.js";
import { DatasetSelector } from "./DatasetSelector.js";
import { FilterSelector } from "./FilterSelector.js";
import { $HR, applyI18n, InlineHelp } from "@heurist/client-core/ui";

export class GraphControlPanel {
  constructor({ api, container, options = {}, datasetListProvider, datasetProvider, filterListProvider }) {
    this.api = api;
    this.container = container;
    this.options = options;
    this.datasetListProvider = datasetListProvider;
    this.datasetProvider = datasetProvider;
    this.filterListProvider = filterListProvider;
    this.listeners = [];
  }

  async mount() {
    this.element = document.createElement("aside");
    this.element.className = "heurist-module-control-panel";
    this.element.setAttribute("aria-label", $HR("Graph controls"));
    const header = document.createElement("div");
    header.className = "heurist-module-panel-header";

    this.angleToggle = iconButton("fa-solid fa-angle-up", "Show or hide panels", () => this.toggleBody());
    this.angleToggle.classList.add("heurist-module-panel-angle-toggle");
    header.append(this.angleToggle);

    this.actions = document.createElement("span");
    this.actions.className = "heurist-module-panel-actions";
    this.expandButton = iconButton("fa-solid fa-diagram-project", "Expand graph", () => this.expandGraph());
    this.exportButton = iconButton("fa-solid fa-file-export", "Export Gephi", () => this.api.exportGephi?.());
    this.helpButton = iconButton("fa-solid fa-circle-question", "Help", () => this.openHelp());
    this.optionsButton = iconButton("fa-solid fa-gear", "Options", () => this.api.openPreferencesDialog?.());
    this.publishButton = iconButton("fa-solid fa-share-nodes", "Publish", () => this.api.openPublishDialog?.());
    this.actions.append(this.expandButton, this.exportButton, this.helpButton, this.optionsButton, this.publishButton);
    header.append(this.actions);

    const toggle = iconButton("fa-solid fa-layer-group", "Show or hide graph controls", () => this.toggleFullyCollapsed());
    toggle.classList.add("heurist-module-panel-toggle");
    header.append(toggle);

    const body = document.createElement("div");
    body.className = "heurist-module-panel-body";
    this.body = body;
    const datasets = section(body);
    this.datasetsSection = datasets.section;
    this.datasetsSelector = new DatasetSelector({ api: this.api, container: datasets.content, classPrefix: "heurist-graph", onError: (error) => this.reportError(error) });
    const filters = section(body, "Filters", true);
    this.filtersSection = filters.section;
    this.filtersSelector = new FilterSelector({
      api: this.api,
      container: filters.content,
      classPrefix: "heurist-graph",
      loadFilter: (id) => this.filterListProvider?.load(id),
      onError: (error) => this.reportError(error),
    });
    this.legendSection = document.createElement('section');
    this.legendSection.className = 'heurist-graph-legend';

    this.legend = new GraphLegend({ api: this.api, container: this.legendSection,
      onEdit: () => this.editDataset(), onLinks: () => this.editLegend('links'),
      onRule: () => this.editLegend('rule'), onError: (error, operation) => this.reportError(error, operation) });
    this.element.append(header, body);
    (this.container.parentElement || document.body).append(this.element);
    this.sourceHeader = document.createElement("div");
    this.sourceHeader.className = "heurist-source-header";
    this.container.prepend(this.sourceHeader);
    if (this.options.initiallyExpanded === false)
      this.element.classList.add("fully-collapsed");
    this.bind("heurist-graph-loaded", () => { void this.render().catch(error => this.reportError(error)); });
    this.bind("heurist-graph-vocabulary-changed", () => this.renderLegend());
    this.bind("heurist-graph-visibility-changed", () => this.renderLegend());
    this.bind("heurist-graph-configuration-changed", (event) => {
      void this.applyOptions(event.detail).catch((error) => this.reportError(error, "apply-options"));
    });
    this.applyVisibility();
    await this.render();
    applyI18n(this.element);
    this.updateExpandedState();
    return this.element;
  }

  bind(name, handler) {
    this.api.addEventListener(name, handler);
    this.listeners.push([name, handler]);
  }

  async render() {
    const state = this.api.getState();
    const currentTitle = this.options.currentResultsTitle || "Filtered Result";
    this.sourceHeader.textContent =
      state.datasetTitle ||
      (currentTitle === "Filtered Result" ? $HR(currentTitle) : currentTitle);
    const [datasets, filters] = await Promise.all([
      this.datasetListProvider?.list?.() || [],
      this.filterListProvider?.list?.() || [],
    ]);
    this.datasetsSelector.render(
      normalizeItems(datasets, "Dataset"),
      state.datasetId,
      !state.datasetId,
      {
        showCurrentResults: this.options.showCurrentResults !== false,
        currentResultsTitle: currentTitle,
      },
    );
    this.renderLegend();
    this.filtersSelector.render(normalizeItems(filters, "Filter"));
    applyI18n(this.element);
  }

  renderLegend() {
    const app = this.api.application;
    const state = this.api.getState();
    const interaction = app?.config.persistedSettings?.options?.interaction || {};
    const editEnabled = interaction.editEnabled !== false && interaction.readonly !== true && Boolean(app?.host?.supportsEditing?.());
    const activeRow = this.datasetsSection.querySelector('.heurist-graph-selector-row.active');
    this.datasetsSection.querySelectorAll('.heurist-graph-dataset-action').forEach(button => button.remove());
    if (activeRow) {
      activeRow.append(this.legendSection);
      if (editEnabled && (state.datasetId || typeof app.host.bridge?.addRecord === 'function')) {
        const action = this.legend.action(state.datasetId ? 'Edit Dataset' : 'Add Dataset', state.datasetId ? 'fa-pen' : 'fa-circle-plus', () => this.editDataset());
        action.classList.add('heurist-graph-dataset-action');
        activeRow.insertBefore(action, this.legendSection);
      }
    } else this.legendSection.remove();
    this.legend.render({ editEnabled });
  }

  async editDataset() {
    const app = this.api.application;
    const id = this.api.getState().datasetId;
    if (id) {
      await app.host.editRecord(id);
      if (this.api.getState().datasetId === id) await this.api.setDataset(id);
    } else {
      const info = await this.datasetListProvider.list({ ids: [] });
      const created = await app.host.addRecord(info.recordTypeId);
      const newId = Number(created?.recordId ?? created?.rec_ID ?? created?.id);
      if (newId > 0) await this.api.setDataset(newId);
    }
  }

  editLegend(mode) {
    this.legendEditor?.destroy();
    this.legendEditor = new GraphLegendEditor({ api: this.api, onError: error => this.reportError(error, 'legend-editor') });
    this.legendEditor.open(mode);
  }

  /** React to settings edited/saved in the Configuration dialog while the panel is mounted. */
  async applyOptions(settings = {}) {
    const options = settings.options || settings;
    this.options = {
      ...this.options,
      ...options.ui,
      currentResultsTitle:
        settings.config?.currentResults?.title || this.options.currentResultsTitle,
    };
    this.element.classList.toggle(
      "fully-collapsed",
      this.options.initiallyExpanded === false,
    );
    this.applyVisibility();
    await this.render();
  }

  async expandGraph() {
    const ids = this.api.getState().selection || [];
    if (ids.length) return this.api.expandNode(ids[0]);
    return this.api.fit?.();
  }

  toggleFullyCollapsed() {
    const fullyCollapsed = this.element.classList.toggle("fully-collapsed");
    if (!fullyCollapsed) {
      this.element.classList.toggle("body-collapsed", !this.hasVisiblePanels);
    }
    this.updateExpandedState();
  }

  toggleBody() {
    if (this.element.classList.contains("fully-collapsed")) return;
    if (!this.hasVisiblePanels) {
      this.toggleFullyCollapsed();
      return;
    }
    this.element.classList.toggle("body-collapsed");
    this.updateExpandedState();
  }

  updateExpandedState() {
    const fullyCollapsed = this.element.classList.contains("fully-collapsed");
    const bodyCollapsed = this.element.classList.contains("body-collapsed");
    this.element.querySelector(".heurist-module-panel-toggle")?.setAttribute("aria-expanded", String(!fullyCollapsed));
    if (this.angleToggle) {
      const expanded = !fullyCollapsed && !bodyCollapsed;
      this.angleToggle.setAttribute("aria-expanded", String(expanded));
      const icon = this.angleToggle.querySelector(".fa-solid");
      icon?.classList.toggle("fa-angle-up", expanded);
      icon?.classList.toggle("fa-angle-down", !expanded);
    }
  }

  /** Load the module user manual for the active language into a full-viewport overlay. */
  openHelp() {
    this.helpOverlay ||= new InlineHelp({ moduleName: "graph" });
    this.helpOverlay.open();
  }

  applyVisibility() {
    if (!this.element) return;
    if (this.sourceHeader && !this.sourceHeader.isConnected)
      this.container.prepend(this.sourceHeader);
    if (this.expandButton)
      this.expandButton.hidden = this.options.showExpand === false;
    if (this.optionsButton)
      this.optionsButton.hidden = this.options.showOptions === false;
    if (this.publishButton)
      this.publishButton.hidden = this.options.showPublish === false;
    if (this.sourceHeader)
      this.sourceHeader.hidden = this.options.showSourceHeader !== true;
    this.element.classList.toggle(
      "with-source-header",
      this.options.showSourceHeader === true,
    );
    this.body?.classList.toggle(
      "with-source-header",
      this.options.showSourceHeader === true,
    );
    if (this.datasetsSection)
      this.datasetsSection.hidden =
        this.options.showDatasets === false &&
        this.options.showCurrentResults === false;
    if (this.filtersSection)
      this.filtersSection.hidden = this.options.showFilters === false;
    const hasVisiblePanel = [this.datasetsSection, this.filtersSection].some(
      (section) => section && !section.hidden,
    );
    this.hasVisiblePanels = hasVisiblePanel;
    if (this.angleToggle) this.angleToggle.hidden = !hasVisiblePanel;
    if (
      !hasVisiblePanel &&
      !this.element.classList.contains("fully-collapsed")
    ) {
      this.element.classList.add("body-collapsed");
    }
    this.updateExpandedState();
  }

  reportError(error, operation) {
    this.api.application?.dispatch?.("heurist-graph-error", { error, operation });
  }

  destroy() {
    this.listeners.forEach(([name, handler]) => this.api.removeEventListener(name, handler));
    this.legendEditor?.destroy();
    this.sourceHeader?.remove();
    this.helpOverlay?.close();
    this.element?.remove();
  }
}

function section(parent, title, collapsible = false) {
  const section = document.createElement("section");
  const heading = document.createElement(collapsible ? "button" : "h3");
  heading.className = "h-i18n";
  heading.textContent = title;
  const content = document.createElement("div");
  if (title) section.append(heading);
  section.append(content);
  if (collapsible) {
    heading.type = 'button';
    heading.classList.add('heurist-graph-section-toggle');
    content.hidden = true;
    heading.setAttribute('aria-expanded', 'false');
    heading.addEventListener('click', () => {
      content.hidden = !content.hidden;
      heading.setAttribute('aria-expanded', String(!content.hidden));
    });
  }
  parent.append(section);
  return { section, content };
}

function iconButton(icon, title, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "heurist-module-icon-button";
  button.title = $HR(title);
  button.setAttribute("aria-label", $HR(title));
  button.innerHTML = `<span class="${icon}" aria-hidden="true"></span>`;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    Promise.resolve(handler()).catch(() => {});
  });
  return button;
}

function normalizeItems(result, fallback) {
  const values = Array.isArray(result) ? result : result?.items || [];
  return values.map((item) => ({
    ...item,
    id: Number(item.id ?? item.rec_ID),
    title: String(item.title ?? item.name ?? item.rec_Title ?? `${fallback} ${item.id ?? item.rec_ID}`),
  })).filter((item) => Number.isInteger(item.id) && item.id > 0);
}
