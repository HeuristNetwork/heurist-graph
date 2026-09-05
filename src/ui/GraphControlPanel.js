/**
 * @file GraphControlPanel.js
 * @brief Graph controls using the heurist-data panel interaction pattern.
 */
import { DatasetSelector } from "./DatasetSelector.js";
import { FilterSelector } from "./FilterSelector.js";
import { $HR, applyI18n, InlineHelp } from "@heurist/client-core/ui";

export class GraphControlPanel {
  constructor({ api, container, datasetListProvider, datasetProvider, filterListProvider }) {
    this.api = api;
    this.container = container;
    this.datasetListProvider = datasetListProvider;
    this.datasetProvider = datasetProvider;
    this.filterListProvider = filterListProvider;
    this.listeners = [];
  }

  async mount() {
    this.element = document.createElement("aside");
    this.element.className = "heurist-module-control-panel with-source-header";
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
    const datasets = section(body, "Datasets");
    this.datasetsSection = datasets.section;
    this.datasetsSelector = new DatasetSelector({ api: this.api, container: datasets.content, classPrefix: "heurist-graph", onError: (error) => this.reportError(error) });
    const filters = section(body, "Filters");
    this.filtersSection = filters.section;
    this.filtersSelector = new FilterSelector({
      api: this.api,
      container: filters.content,
      classPrefix: "heurist-graph",
      loadFilter: (id) => this.filterListProvider?.load(id),
      onError: (error) => this.reportError(error),
    });
    this.element.append(header, body);
    (this.container.parentElement || document.body).append(this.element);
    this.sourceHeader = document.createElement("div");
    this.sourceHeader.className = "heurist-source-header";
    this.container.prepend(this.sourceHeader);
    this.bind("heurist-graph-loaded", () => this.render());
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
    this.sourceHeader.textContent = state.datasetTitle || $HR("Current result");
    const [datasets, filters] = await Promise.all([
      this.datasetListProvider?.list?.() || [],
      this.filterListProvider?.list?.() || [],
    ]);
    this.datasetsSelector.render(normalizeItems(datasets, "Dataset"), state.datasetId, !state.datasetId);
    this.filtersSelector.render(normalizeItems(filters, "Filter"));
    applyI18n(this.element);
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
    this.sourceHeader.hidden = false;
    this.hasVisiblePanels = true;
    if (this.angleToggle) this.angleToggle.hidden = !this.hasVisiblePanels;
  }

  reportError(error) {
    this.api.application?.dispatch?.("heurist-graph-error", { error });
  }

  destroy() {
    this.listeners.forEach(([name, handler]) => this.api.removeEventListener(name, handler));
    this.sourceHeader?.remove();
    this.helpOverlay?.close();
    this.element?.remove();
  }
}

function section(parent, title) {
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.className = "h-i18n";
  heading.textContent = title;
  const content = document.createElement("div");
  section.append(heading, content);
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
