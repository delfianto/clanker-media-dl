import browser from "webextension-polyfill";
import type { HosterId, Settings } from "../types/global";
import type { HosterModel, RedirectRule } from "../types/hoster";
import { ALL_MODELS, getModel } from "../hosts/index";
import { DEFAULT_SETTINGS } from "../settings/schema";

let settings: Settings;
let selected: HosterId = "imagebam";
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

// Tiny typed createElement helper: props are real element properties (so
// className/value/checked/etc. are type-checked), children are nodes or text.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
  for (const child of children) node.append(child);
  return node;
}

// ── persistence ──────────────────────────────────────
function persist(): void {
  void browser.storage.local.set(settings as unknown as Record<string, unknown>).then(
    () => toast("Saved ✓"),
    () => toast("Save failed", true),
  );
}

function persistSoon(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}

function toast(message: string, isError = false): void {
  const node = $("toast");
  node.textContent = message;
  node.className = isError ? "toast show error" : "toast show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.className = "toast";
  }, 1600);
}

// ── validation helpers ───────────────────────────────
function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// Capture-group count via the empty-match trick: `pattern|` always matches "",
// and the result array has one slot per capture group (plus index 0).
function groupCount(pattern: string): number {
  try {
    const match = new RegExp(`${pattern}|`).exec("");
    return match ? match.length - 1 : 0;
  } catch {
    return 0;
  }
}

function maxTemplateRef(template: string): number {
  let max = 0;
  for (const m of template.matchAll(/\$(\d+)/g)) {
    max = Math.max(max, Number(m[1] ?? "0"));
  }
  return max;
}

// Rules to show: the stored override, or a fresh clone of the model defaults
// when the user hasn't customised them yet.
function displayRules(model: HosterModel): RedirectRule[] {
  return settings.hosters[model.id].redirectRules ?? clone(model.defaultRedirectRules);
}

// ── rendering ────────────────────────────────────────
function renderSidebar(): void {
  const list = $("hoster-list");
  list.replaceChildren();
  for (const model of ALL_MODELS) {
    const on = settings.hosters[model.id].enabled;
    const item = el(
      "li",
      { className: model.id === selected ? "hoster-item active" : "hoster-item" },
      [
        el("span", { className: "name", textContent: model.displayName }),
        el("span", { className: on ? "dot on" : "dot" }),
      ],
    );
    item.addEventListener("click", () => {
      selected = model.id;
      renderSidebar();
      renderPanel();
    });
    list.append(item);
  }
}

function renderRuleCard(
  model: HosterModel,
  rules: RedirectRule[],
  rule: RedirectRule,
  index: number,
): HTMLElement {
  const override = settings.hosters[model.id];

  // Materialise the override from the displayed rules on any edit, then save.
  function touch(immediate: boolean): void {
    override.redirectRules = rules;
    if (immediate) persist();
    else persistSoon();
  }

  const enabled = el("input", { type: "checkbox", checked: rule.enabled });
  enabled.addEventListener("change", () => {
    rule.enabled = enabled.checked;
    touch(true);
  });

  const desc = el("input", {
    type: "text",
    className: "rule-desc",
    value: rule.description,
    placeholder: "Description",
  });
  desc.addEventListener("input", () => {
    rule.description = desc.value;
    touch(false);
  });

  const del = el("button", { className: "del-btn", title: "Delete rule", textContent: "✕" });
  del.addEventListener("click", () => {
    rules.splice(index, 1);
    override.redirectRules = rules;
    persist();
    renderPanel();
  });

  const pattern = el("input", {
    type: "text",
    className: "rule-pattern mono",
    value: rule.pattern,
    placeholder: "^https?://…",
    spellcheck: false,
  });
  const patternMsg = el("p", { className: "field-msg" });

  const template = el("input", {
    type: "text",
    className: "rule-template mono",
    value: rule.template,
    placeholder: "https://…/$1",
    spellcheck: false,
  });
  const templateMsg = el("p", { className: "field-msg" });

  function validate(): void {
    const ok = pattern.value === "" || isValidRegex(pattern.value);
    pattern.classList.toggle("invalid", !ok);
    patternMsg.textContent = ok ? "" : "⚠ Invalid regex";
    patternMsg.className = ok ? "field-msg" : "field-msg error";

    const refs = maxTemplateRef(template.value);
    const groups = ok ? groupCount(pattern.value) : 0;
    if (ok && refs > groups) {
      templateMsg.textContent = `⚠ Template uses $${refs} but the pattern has ${groups} capture group(s)`;
      templateMsg.className = "field-msg warn";
    } else {
      templateMsg.textContent = "";
      templateMsg.className = "field-msg";
    }
  }

  pattern.addEventListener("input", () => {
    rule.pattern = pattern.value;
    validate();
    touch(false);
  });
  template.addEventListener("input", () => {
    rule.template = template.value;
    validate();
    touch(false);
  });
  validate();

  return el("div", { className: "rule" }, [
    el("div", { className: "rule-head" }, [enabled, desc, del]),
    el("label", { className: "field" }, ["Pattern", pattern]),
    patternMsg,
    el("label", { className: "field" }, ["Template", template]),
    templateMsg,
  ]);
}

function renderRulesSection(model: HosterModel): HTMLElement {
  const override = settings.hosters[model.id];
  const rules = displayRules(model);

  const container = el("div", { className: "rules" });
  rules.forEach((rule, i) => container.append(renderRuleCard(model, rules, rule, i)));

  const resetBtn = el("button", { className: "reset-btn", textContent: "↺ Reset" });
  resetBtn.addEventListener("click", () => {
    if (
      !confirm(`Discard all custom redirect rules for ${model.displayName} and restore defaults?`)
    ) {
      return;
    }
    override.redirectRules = null;
    persist();
    renderPanel();
    toast("Rules reset to defaults");
  });

  const addBtn = el("button", { className: "add-btn", textContent: "+ Add Rule" });
  addBtn.addEventListener("click", () => {
    const next = override.redirectRules ?? clone(model.defaultRedirectRules);
    next.push({
      id: `${model.id}-custom-${Date.now()}`,
      description: "New rule",
      pattern: "",
      template: "",
      enabled: true,
    });
    override.redirectRules = next;
    persist();
    renderPanel();
  });

  const section = el("section", {}, [
    el("div", { className: "section-head" }, [
      el("h3", { textContent: "Redirect Rules" }),
      resetBtn,
    ]),
    container,
    addBtn,
  ]);

  if (model.cdnMatches.length === 0) {
    section.append(
      el("p", {
        className: "empty-note",
        textContent:
          "This hoster has no CDN redirect — its thumbnails link straight to the viewer page, so rules here won't run.",
      }),
    );
  } else if (override.redirectRules === null) {
    section.append(
      el("p", {
        className: "default-note",
        textContent: "Using built-in defaults. Editing any field creates your own copy.",
      }),
    );
  }
  return section;
}

function renderCssSection(model: HosterModel): HTMLElement {
  const override = settings.hosters[model.id];

  const textarea = el("textarea", {
    className: "css-editor mono",
    value: override.cssOverrides,
    spellcheck: false,
    placeholder: "/* custom CSS injected into this hoster's viewer page */",
  });
  textarea.addEventListener("input", () => {
    override.cssOverrides = textarea.value;
    persistSoon();
  });

  const resetBtn = el("button", { className: "reset-btn", textContent: "↺ Reset" });
  resetBtn.addEventListener("click", () => {
    override.cssOverrides = model.defaultCssOverrides;
    persist();
    renderPanel();
    toast("CSS reset");
  });

  return el("section", {}, [
    el("div", { className: "section-head" }, [
      el("h3", { textContent: "CSS Overrides" }),
      resetBtn,
    ]),
    textarea,
  ]);
}

function renderPanel(): void {
  const model = getModel(selected);
  const panel = $("panel");
  panel.replaceChildren();
  if (!model) return;

  const override = settings.hosters[model.id];
  const toggle = el("input", { type: "checkbox", checked: override.enabled });
  toggle.addEventListener("change", () => {
    override.enabled = toggle.checked;
    persist();
    renderSidebar();
  });

  panel.append(
    el("div", { className: "panel-head" }, [
      el("h2", { textContent: model.displayName }),
      el("label", { className: "hoster-toggle" }, [
        el("span", { textContent: "Enabled" }),
        el("span", { className: "switch" }, [toggle, el("span", { className: "slider" })]),
      ]),
    ]),
    renderRulesSection(model),
    renderCssSection(model),
  );
}

// ── init ─────────────────────────────────────────────
async function init(): Promise<void> {
  try {
    settings = (await browser.storage.local.get(DEFAULT_SETTINGS)) as Settings;
  } catch {
    settings = clone(DEFAULT_SETTINGS);
  }
  // Heal missing hosters (corrupted storage / a hoster added in a new version).
  for (const model of ALL_MODELS) {
    settings.hosters[model.id] ??= clone(DEFAULT_SETTINGS.hosters[model.id]);
  }

  $<HTMLSpanElement>("version").textContent = `v${browser.runtime.getManifest().version}`;

  const master = $<HTMLInputElement>("master-enabled");
  master.checked = settings.enabled;
  master.addEventListener("change", () => {
    settings.enabled = master.checked;
    persist();
  });

  renderSidebar();
  renderPanel();
}

void init();
