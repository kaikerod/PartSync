import { api } from "./api.js";

// PartSync - Application Logic (Non-WhatsApp Version)

// Autocomplete Dictionaries
const DEVICEMODELS_DB = [];

const PARTS_DB = [
  "Display UB",
  "Gabinete Frontal",
  "Bateria de Fábrica",
  "Carregador",
  "Flex Principal",
  "Sub-Placa de Conector de Carga",
  "Tampa Traseira de Vidro",
  "Câmera Traseira Principal",
  "Câmera Frontal",
  "Flex de Botão Power e Biometria",
  "Flex de Botões de Volume",
  "Alto-Falante Auricular",
  "Alto-Falante Campainha",
  "Lente de Vidro da Câmera",
  "Aro Lateral / Chassi",
  "Gaveta de Chip SIM",
  "Película",
  "Conjunto de Fitas"
];

// App State
let state = {
  requests: [],
  appointments: [],
  settings: {
    defaultRequester: "",
    technicians: ["Técnico 1", "Técnico 2"]
  }
};

let calendarState = {
  selectedDate: new Date().toISOString().split("T")[0],
  currentView: "daily",
  selectedTechnician: "all",
  sidebarCollapsed: false
};

// Temporarily holds parts added to the current form request
let formAddedParts = [];

const CHARGER_PART_NAME = "Carregador";
const CHARGER_DEFAULT_TYPE = "Tipo C";
const CHARGER_DEFAULT_COLOR = "Preto";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const AUTOMATIC_HISTORY_NOTES = [
  "Solicitação registrada no sistema",
  "Status alterado para ",
  "Atualização em lote para status "
];

function isAutomaticHistoryNote(note) {
  return AUTOMATIC_HISTORY_NOTES.some(automaticNote =>
    note === automaticNote || note.startsWith(automaticNote)
  );
}

function getLatestManualHistoryNote(request) {
  const logs = Array.isArray(request.logs) ? request.logs : [];

  for (let index = logs.length - 1; index >= 0; index--) {
    const note = typeof logs[index]?.notes === "string" ? logs[index].notes.trim() : "";
    if (note && !isAutomaticHistoryNote(note)) {
      return note;
    }
  }

  return "";
}

function getCreationNote(request) {
  return (request.notes || "").trim();
}

function getStatusNote(request) {
  return getLatestManualHistoryNote(request);
}

function getRequestDisplayNotes(request) {
  return appendUniqueNote(getCreationNote(request), getStatusNote(request));
}

function appendUniqueNote(currentNotes, nextNote) {
  const cleanNote = typeof nextNote === "string" ? nextNote.trim() : "";
  if (!cleanNote) return currentNotes || "";

  const notes = currentNotes || "";
  const existingNotes = notes
    .split(/\r?\n/)
    .map(note => note.trim())
    .filter(Boolean);

  if (existingNotes.includes(cleanNote)) return notes;

  return notes ? `${notes}\n${cleanNote}` : cleanNote;
}

function renderNoteCell(request) {
  const creation = getCreationNote(request);
  const status = getStatusNote(request);

  if (!creation && !status) {
    return '<span class="table-note-empty">Sem nota</span>';
  }

  let html = "";
  if (creation) {
    html += `<div class="note-entry note-creation"><span class="note-label">Obs:</span> ${escapeHtml(creation)}</div>`;
  }
  if (status) {
    html += `<div class="note-entry note-status"><span class="note-label">Status:</span> ${escapeHtml(status)}</div>`;
  }
  return html;
}

function renderGroupNoteCell(group) {
  const creation = (group.creationNotes || "").trim();
  const status = (group.statusNotes || "").trim();

  if (!creation && !status) {
    return '<span class="table-note-empty">Sem nota</span>';
  }

  let html = "";
  if (creation) {
    html += `<div class="note-entry note-creation"><span class="note-label">Obs:</span> ${escapeHtml(creation)}</div>`;
  }
  if (status) {
    html += `<div class="note-entry note-status"><span class="note-label">Status:</span> ${escapeHtml(status)}</div>`;
  }
  return html;
}

function formatDashboardDate(value) {
  const dateObj = new Date(value);
  return dateObj.toLocaleDateString("pt-BR") + " " + dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getUrgencyClass(urgency) {
  const urgencyText = String(urgency || "").toLowerCase();
  if (urgencyText === "baixa") return "low";
  if (urgencyText.startsWith("m")) return "medium";
  return "high";
}

function bindNewRequestShortcuts(root = document) {
  root.querySelectorAll(".btn-new-req-shortcut").forEach(btn => {
    if (btn.dataset.shortcutBound === "true") return;
    btn.dataset.shortcutBound = "true";
    btn.addEventListener("click", () => {
      document.querySelector('.nav-item[data-target="new-request"], .mobile-nav-item[data-target="new-request"]')?.click();
    });
  });
}

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadData();
  } catch (error) {
    console.error(error);
    showToast("Erro ao conectar ao banco SQLite.", "error");
  }

  setupRouter();
  setupFormEventListeners();
  setupAutocomplete();
  setupHistoryFilters();
  setupSettingsEventListeners();
  setupModals();
  setupCalendarEventListeners();
  setupAppointmentModals();
  updateDashboard();

  // Initialize Lucide Icons
  lucide.createIcons();

  // Trigger initial live summary update
  updateSummaryPreview();
});

// Load data from SQLite API
async function loadData() {
  const [requests, settings, appointments] = await Promise.all([
    api.getRequests(),
    api.getSettings(),
    api.getAppointments().catch(() => [])
  ]);

  state.requests = Array.isArray(requests) ? requests : [];
  state.settings = {
    technicians: ["Técnico 1", "Técnico 2"],
    ...state.settings,
    ...settings
  };
  if (!Array.isArray(state.settings.technicians) || state.settings.technicians.length === 0) {
    state.settings.technicians = ["Técnico 1", "Técnico 2"];
  }
  state.appointments = Array.isArray(appointments) ? appointments : [];

  await migrateLocalStorageData();
}

async function migrateLocalStorageData() {
  const localRequests = readLocalJson("partsync_requests", []);
  const localSettings = readLocalJson("partsync_settings", {});
  const hasLocalRequests = Array.isArray(localRequests) && localRequests.length > 0;
  const hasLocalDefaultRequester = Boolean(localSettings.defaultRequester);
  const shouldMigrate =
    (state.requests.length === 0 && hasLocalRequests) ||
    (hasLocalDefaultRequester && !state.settings.defaultRequester);

  if (!shouldMigrate) return;

  const migrated = await api.migrate({
    requests: hasLocalRequests ? localRequests : [],
    settings: hasLocalDefaultRequester ? localSettings : state.settings
  });

  state.requests = Array.isArray(migrated.requests) ? migrated.requests : state.requests;
  state.settings = { ...state.settings, ...(migrated.settings ?? {}) };
  localStorage.removeItem("partsync_requests");
  localStorage.removeItem("partsync_settings");
}

function readLocalJson(key, fallback) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Save requests to SQLite API
async function saveRequests() {
  try {
    const result = await api.saveRequests(state.requests);
    state.requests = Array.isArray(result.requests) ? result.requests : state.requests;
    updateDashboard();
    renderHistoryTable();
    return true;
  } catch (error) {
    console.error(error);
    showToast("Erro ao salvar no banco SQLite.", "error");
    return false;
  }
}

// Router & Section Toggling
function setupRouter() {
  const navItems = document.querySelectorAll(".nav-item, .mobile-nav-item, .view-all-link, .btn-new-req-shortcut");

  function resolveRouteTarget(target) {
    if (target === "calendario") return "calendar";
    if (target === "nova-solicitacao") return "new-request";
    if (target === "historico") return "history";
    if (target === "configuracoes") return "settings";
    return target;
  }

  function updateRouteHash(targetId, replace = false) {
    const nextHash = `#${targetId}`;
    if (window.location.hash === nextHash) return;
    const method = replace ? "replaceState" : "pushState";
    window.history[method](null, "", nextHash);
  }
  
  function navigateToSection(targetId) {
    // Hide all sections
    document.querySelectorAll(".content-section").forEach(sec => {
      sec.classList.remove("active");
    });
    
    // Deactivate all nav items
    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(item => {
      item.classList.remove("active");
    });

    // Show target section
    const targetSection = document.getElementById(targetId);
    if (targetSection) {
      targetSection.classList.add("active");
    }

    // Set active nav link
    document.querySelectorAll(`.nav-item[data-target="${targetId}"], .mobile-nav-item[data-target="${targetId}"]`).forEach(link => {
      link.classList.add("active");
    });

    // Custom actions per section
    if (targetId === "history") {
      renderHistoryTable();
    } else if (targetId === "dashboard") {
      updateDashboard();
    } else if (targetId === "calendar") {
      renderCalendar();
      renderPendingArrivedParts();
    } else if (targetId === "settings") {
      renderTechniciansManager();
    } else if (targetId === "new-request") {
      updateSummaryPreview();
      // Auto-set date in summary paper
      const now = new Date();
      const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const paperDate = document.getElementById("paper-date-display");
      if (paperDate) paperDate.textContent = dateStr;
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Monitor links
  navItems.forEach(item => {
    item.addEventListener("click", (e) => {
      const target = item.getAttribute("data-target") || item.getAttribute("href")?.replace("#", "");
      if (!target) return;
      const resolvedTarget = resolveRouteTarget(target);

      if (document.getElementById(resolvedTarget)) {
        e.preventDefault();
        navigateToSection(resolvedTarget);
        updateRouteHash(resolvedTarget);
      }
    });
  });

  // Shortcut triggers
  document.querySelectorAll(".btn-new-req-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      navigateToSection("new-request");
      updateRouteHash("new-request");
    });
  });

  // Mobile Top Header Settings Button
  const mobileSettingsBtn = document.getElementById("mobile-settings-btn");
  if (mobileSettingsBtn) {
    mobileSettingsBtn.addEventListener("click", () => {
      navigateToSection("settings");
      updateRouteHash("settings");
    });
  }

  // Handle URL hash on load
  if (window.location.hash) {
    const hash = resolveRouteTarget(window.location.hash.replace("#", ""));
    if (document.getElementById(hash)) {
      navigateToSection(hash);
      updateRouteHash(hash, true);
    }
  }
}

// Toast System
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let iconName = "check-circle";
  if (type === "info") iconName = "info";
  if (type === "warning") iconName = "alert-triangle";
  if (type === "error") iconName = "x-circle";

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <div class="toast-message">${message}</div>
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Handle Close click
  toast.querySelector(".toast-close").addEventListener("click", () => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  });

  // Auto Dismiss
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 300);
    }
  }, 4500);
}

// Format the request into a clean text snippet for clipboard copy
function generateSummaryText(data) {
  let partsText = "";
  if (Array.isArray(data.parts) && data.parts.length > 0) {
    partsText = data.parts.map(p => `- Peça: ${p.name} (${p.quantity}x)`).join("\n");
  } else if (data.partName) {
    partsText = `- Peça: ${data.partName} (${data.quantity}x)`;
  } else {
    partsText = "- Peça: Não especificada";
  }

  return `FICHA DE SOLICITAÇÃO - PARTSYNC
----------------------------------
Data/Hora: ${data.date}
Cliente: ${data.requester}
Aparelho: ${data.deviceModel}
Modelo Específico: ${data.deviceModelCode || "Não informado"}
IMEI: ${data.imei || "Não informado"}
${partsText}
Urgência: ${data.urgency}
----------------------------------
Observações: ${data.notes || "Nenhuma."}`;
}

function addOrIncrementPart(parts, partName, quantity = 1) {
  const existingIdx = parts.findIndex(p => p.name.toLowerCase() === partName.toLowerCase());

  if (existingIdx !== -1) {
    parts[existingIdx].quantity += quantity;
  } else {
    parts.push({
      name: partName,
      quantity
    });
  }

  return parts;
}

function normalizePartName(partName) {
  return partName
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isChargerPart(partName) {
  return normalizePartName(partName) === "carregador";
}

function getSelectedChargerType() {
  return document.getElementById("charger-type")?.value || CHARGER_DEFAULT_TYPE;
}

function getSelectedChargerColor() {
  return document.getElementById("charger-color")?.value || CHARGER_DEFAULT_COLOR;
}

function getConfiguredPartName(partName) {
  const trimmedPartName = partName.trim();
  if (!isChargerPart(trimmedPartName)) return trimmedPartName;
  return `${CHARGER_PART_NAME} ${getSelectedChargerType()} ${getSelectedChargerColor()}`;
}

function getCurrentPartDraft() {
  const partNameInput = document.getElementById("part-name");
  const partQuantityInput = document.getElementById("part-quantity");
  const rawPartName = partNameInput?.value.trim() || "";
  if (!rawPartName) return null;

  return {
    rawName: rawPartName,
    name: getConfiguredPartName(rawPartName),
    quantity: parseInt(partQuantityInput?.value) || 1
  };
}

function resetChargerOptions() {
  const chargerType = document.getElementById("charger-type");
  const chargerColor = document.getElementById("charger-color");

  if (chargerType) chargerType.value = CHARGER_DEFAULT_TYPE;
  if (chargerColor) chargerColor.value = CHARGER_DEFAULT_COLOR;
  syncPartVariantControls();
}

function syncPartVariantControls() {
  const partNameInput = document.getElementById("part-name");
  const chargerOptions = document.getElementById("charger-options");
  const chargerType = document.getElementById("charger-type");
  const chargerColor = document.getElementById("charger-color");
  if (!partNameInput || !chargerOptions) return;

  const shouldShow = isChargerPart(partNameInput.value);
  chargerOptions.hidden = !shouldShow;
  chargerOptions.setAttribute("aria-hidden", String(!shouldShow));

  [chargerType, chargerColor].forEach(select => {
    if (!select) return;
    select.disabled = !shouldShow;
  });
}

function getPartQuantity(parts, partName) {
  return parts
    .filter(p => p.name.toLowerCase() === partName.toLowerCase())
    .reduce((sum, part) => sum + (parseInt(part.quantity) || 0), 0);
}

// Automatically ensures the front cabinet companion battery is included when needed
function ensureRelatedParts(parts) {
  const hasFrontCabinet = parts.some(p => p.name.toLowerCase() === "gabinete frontal");
  const hasBattery = parts.some(p => p.name.toLowerCase() === "bateria de fábrica");
  const frontCabinetQuantity = getPartQuantity(parts, "Gabinete Frontal");

  if (hasFrontCabinet && !hasBattery) {
    parts.push({
      name: "Bateria de Fábrica",
      quantity: frontCabinetQuantity || 1
    });
  }

  return parts;
}


// Live update of the Ficha Técnica summary panel
function updateSummaryPreview() {
  const requester = document.getElementById("requester-name").value || "-";
  const deviceModel = document.getElementById("device-model").value || "-";
  const deviceModelCode = document.getElementById("device-model-code").value || "-";
  const imei = document.getElementById("device-imei").value || "-";
  
  const urgencyActive = document.querySelector('input[name="urgency"]:checked');
  const urgency = urgencyActive ? urgencyActive.value : "Baixa";
  
  const notes = document.getElementById("request-notes").value || "";
  
  // Update HTML elements in the summary card
  document.getElementById("sum-requester").textContent = requester;
  document.getElementById("sum-device").textContent = deviceModel;
  document.getElementById("sum-device-code").textContent = deviceModelCode;
  document.getElementById("sum-imei").textContent = imei;
  document.getElementById("sum-urgency").textContent = urgency;
  
  const notesDisplay = document.getElementById("sum-notes");
  if (notesDisplay) {
    notesDisplay.textContent = notes ? notes : "Nenhuma observação informada.";
  }

  const sumPartsList = document.getElementById("sum-parts-list");
  if (sumPartsList) {
    sumPartsList.innerHTML = "";
    
    // Combine both formAddedParts and any typed input in #part-name (if not empty)
    const previewParts = [...formAddedParts];
    const currentPart = getCurrentPartDraft();
    
    if (currentPart) {
      const existingIdx = previewParts.findIndex(p => p.name.toLowerCase() === currentPart.name.toLowerCase());
      if (existingIdx !== -1) {
        previewParts[existingIdx].quantity += currentPart.quantity;
      } else {
        previewParts.push({
          name: currentPart.name,
          quantity: currentPart.quantity
        });
      }
    }
    
    ensureRelatedParts(previewParts);
    
    if (previewParts.length === 0) {
      sumPartsList.innerHTML = `
        <div class="paper-field" style="margin-bottom: 0;">
          <span class="field-label">-</span>
          <span class="field-val">-</span>
        </div>
      `;
    } else {
      previewParts.forEach(part => {
        const row = document.createElement("div");
        row.className = "paper-field";
        row.style.marginBottom = "6px";
        row.innerHTML = `
          <span class="field-val text-white" style="font-weight:600; text-align: left;">${part.name}</span>
          <span class="field-val text-white" style="font-weight:600; margin-left: 10px; white-space: nowrap;">${part.quantity}x</span>
        `;
        sumPartsList.appendChild(row);
      });
    }
  }
}

// Add a part to the temporary form selection list
function addPartToList() {
  const partNameInput = document.getElementById("part-name");
  const partQuantityInput = document.getElementById("part-quantity");
  const partDraft = getCurrentPartDraft();
  const partName = partDraft?.name || "";
  const quantity = parseInt(partQuantityInput.value);
  
  if (!partName) {
    showToast("Por favor, informe o nome da peça.", "warning");
    partNameInput.focus();
    return;
  }
  
  if (!quantity || quantity < 1) {
    showToast("Por favor, informe uma quantidade maior ou igual a 1.", "warning");
    partQuantityInput.focus();
    return;
  }
  
  addOrIncrementPart(formAddedParts, partName, quantity);
  if (partDraft.rawName.toLowerCase() === "gabinete frontal") {
    addOrIncrementPart(formAddedParts, "Bateria de Fábrica", quantity);
  }
  
  // Clear inputs
  partNameInput.value = "";
  partQuantityInput.value = "1";
  resetChargerOptions();
  partNameInput.dispatchEvent(new Event("input", { bubbles: true }));
  
  renderFormAddedParts();
  updateSummaryPreview();
  showToast("Peça adicionada à lista!");
  partNameInput.focus();
  return true;
}

// Render the list of added parts in the form
function renderFormAddedParts() {
  const listContainer = document.getElementById("added-parts-list");
  if (!listContainer) return;
  
  if (formAddedParts.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-parts-message">
        <strong>Nenhuma peça na lista.</strong>
        <span>A peça preenchida acima também entra ao confirmar a solicitação.</span>
      </div>
    `;
    return;
  }
  
  listContainer.innerHTML = "";
  formAddedParts.forEach((part, index) => {
    const item = document.createElement("div");
    item.className = "added-part-item";

    const info = document.createElement("div");
    info.className = "added-part-info";

    const toolIcon = document.createElement("i");
    toolIcon.setAttribute("data-lucide", "tool");

    const name = document.createElement("span");
    name.className = "added-part-name";
    name.textContent = part.name;

    const quantity = document.createElement("span");
    quantity.className = "added-part-qty";
    quantity.textContent = `${part.quantity}x`;

    info.append(toolIcon, name, quantity);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn-remove-part";
    removeButton.dataset.index = String(index);
    removeButton.title = "Remover";
    removeButton.setAttribute("aria-label", `Remover ${part.name}`);

    const removeIcon = document.createElement("i");
    removeIcon.setAttribute("data-lucide", "trash-2");
    removeButton.appendChild(removeIcon);

    item.append(info, removeButton);
    listContainer.appendChild(item);
  });
  
  // Setup remove button handlers
  listContainer.querySelectorAll(".btn-remove-part").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = parseInt(btn.getAttribute("data-index"));
      formAddedParts.splice(index, 1);
      renderFormAddedParts();
      updateSummaryPreview();
    });
  });
  
  lucide.createIcons();
}

// Form Event Listeners
function setupFormEventListeners() {
  const form = document.getElementById("parts-request-form");
  const inputs = form.querySelectorAll("input, select, textarea");
  
  // Real-time preview update
  inputs.forEach(input => {
    input.addEventListener("input", updateSummaryPreview);
    input.addEventListener("change", updateSummaryPreview);
  });

  const btnReset = document.getElementById("btn-reset-form");
  const btnCopySummary = document.getElementById("btn-copy-summary");
  const btnAddPart = document.getElementById("btn-add-part");
  const partNameInput = document.getElementById("part-name");

  if (btnAddPart) {
    btnAddPart.addEventListener("click", addPartToList);
  }

  if (partNameInput) {
    ["input", "change"].forEach(eventName => {
      partNameInput.addEventListener(eventName, () => {
        syncPartVariantControls();
        updateSummaryPreview();
      });
    });
  }

  ["part-name", "part-quantity"].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (input.getAttribute("aria-activedescendant")) return;

      event.preventDefault();
      addPartToList();
    });
  });

  btnReset.addEventListener("click", () => {
    form.reset();
    formAddedParts = [];
    resetChargerOptions();
    renderFormAddedParts();
    updateSummaryPreview();
    showToast("Formulário limpo", "info");
  });

  btnCopySummary.addEventListener("click", () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const requester = document.getElementById("requester-name").value || "Cliente";
    const deviceModel = document.getElementById("device-model").value || "Não especificado";
    const deviceModelCode = document.getElementById("device-model-code").value.trim() || "";
    const imei = document.getElementById("device-imei").value.trim() || "";
    
    const urgencyActive = document.querySelector('input[name="urgency"]:checked');
    const urgency = urgencyActive ? urgencyActive.value : "Baixa";
    
    const notes = document.getElementById("request-notes").value || "";

    // Gather all parts
    const copyParts = [...formAddedParts];
    const currentPart = getCurrentPartDraft();
    
    if (currentPart) {
      const existingIdx = copyParts.findIndex(p => p.name.toLowerCase() === currentPart.name.toLowerCase());
      if (existingIdx !== -1) {
        copyParts[existingIdx].quantity += currentPart.quantity;
      } else {
        copyParts.push({
          name: currentPart.name,
          quantity: currentPart.quantity
        });
      }
    }

    ensureRelatedParts(copyParts);

    const textToCopy = generateSummaryText({
      date: dateStr,
      requester,
      deviceModel,
      deviceModelCode,
      imei,
      parts: copyParts,
      urgency,
      notes
    });

    navigator.clipboard.writeText(textToCopy)
      .then(() => showToast("Ficha técnica copiada para a área de transferência!"))
      .catch(() => showToast("Erro ao copiar ficha técnica.", "error"));
  });

  // Submit Handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (validateForm()) {
      await saveRequestFromForm();
    }
  });

  syncPartVariantControls();
}

function validateForm() {
  const requester = document.getElementById("requester-name").value.trim();
  const deviceModel = document.getElementById("device-model").value.trim();
  const partName = getCurrentPartDraft()?.name || "";
  const quantity = document.getElementById("part-quantity").value;

  if (!requester) {
    showToast("Nome do cliente é obrigatório", "error");
    return false;
  }
  if (!deviceModel) {
    showToast("Modelo do dispositivo é obrigatório", "error");
    return false;
  }


  // Check if both list and inputs are empty
  if (formAddedParts.length === 0 && !partName) {
    showToast("Adicione pelo menos uma peça à solicitação", "error");
    return false;
  }

  // If partName is typed, quantity must be valid
  if (partName && (!quantity || quantity < 1)) {
    showToast("Insira uma quantidade válida superior a 0", "error");
    return false;
  }

  return true;
}

async function saveRequestFromForm() {
  const requester = document.getElementById("requester-name").value.trim();
  const deviceModel = document.getElementById("device-model").value.trim();
  const deviceModelCode = document.getElementById("device-model-code").value.trim();
  const imei = document.getElementById("device-imei").value.trim();
  const currentPart = getCurrentPartDraft();
  
  const urgencyActive = document.querySelector('input[name="urgency"]:checked');
  const urgency = urgencyActive ? urgencyActive.value : "Baixa";
  
  const notes = document.getElementById("request-notes").value.trim();
  
  const partsToRequest = [...formAddedParts];
  if (currentPart) {
    const existingIdx = partsToRequest.findIndex(p => p.name.toLowerCase() === currentPart.name.toLowerCase());
    if (existingIdx !== -1) {
      partsToRequest[existingIdx].quantity += currentPart.quantity;
    } else {
      partsToRequest.push({
        name: currentPart.name,
        quantity: currentPart.quantity
      });
    }
  }

  ensureRelatedParts(partsToRequest);

  const now = new Date();
  const orderId = "ord_" + now.getTime() + "_" + Math.floor(Math.random() * 1000);
  const createdRequests = [];

  for (let i = 0; i < partsToRequest.length; i++) {
    const part = partsToRequest[i];
    // Add tiny offsets to preserve ordering in DB/view (since they render in DESC order)
    const timestamp = new Date(now.getTime() - i * 1000);
    
    const newRequest = {
      id: "req_" + timestamp.getTime() + "_" + Math.floor(Math.random() * 1000),
      createdAt: timestamp.toISOString(),
      requester,
      deviceModel,
      deviceModelCode,
      imei,
      partName: part.name,
      quantity: part.quantity,
      urgency,
      notes,
      status: "Pendente",
      orderId,
      logs: [
        {
          timestamp: timestamp.toISOString(),
          status: "Pendente",
          notes: "Solicitação registrada no sistema"
        }
      ]
    };
    createdRequests.push(newRequest);
  }

  // Put them all at the beginning of the requests array
  state.requests.unshift(...createdRequests);

  if (!(await saveRequests())) return null;

  if (partsToRequest.length === 1) {
    showToast(`Solicitação de "${partsToRequest[0].name}" salva com sucesso!`);
  } else {
    showToast(`${partsToRequest.length} solicitações salvas com sucesso!`);
  }

  // Clear inputs (including Client Name)
  document.getElementById("requester-name").value = "";
  document.getElementById("device-model").value = "";
  document.getElementById("device-model-code").value = "";
  document.getElementById("device-imei").value = "";
  document.getElementById("part-name").value = "";
  document.getElementById("part-quantity").value = 1;
  resetChargerOptions();
  document.getElementById("urgency-low").checked = true;
  document.getElementById("request-notes").value = "";

  // Reset form parts list
  formAddedParts = [];
  renderFormAddedParts();

  updateSummaryPreview();

  return createdRequests[0];
}

// Autocomplete logic
function setupAutocomplete() {
  function autocomplete(inp, arr, listId) {
    let currentFocus;
    inp.setAttribute("aria-autocomplete", "list");
    inp.setAttribute("aria-controls", listId);
    inp.setAttribute("aria-expanded", "false");
    
    inp.addEventListener("input", function(e) {
      let a, b, i, val = this.value;
      closeAllLists();
      if (!val) { return false;}
      currentFocus = -1;
      
      a = document.getElementById(listId);
      
      // Filter suggestions
      const filtered = arr.filter(item => item.toLowerCase().includes(val.toLowerCase()));
      if (filtered.length === 0) {
        a.style.display = "none";
        a.setAttribute("aria-hidden", "true");
        inp.setAttribute("aria-expanded", "false");
        return;
      }
      
      a.style.display = "block";
      a.setAttribute("aria-hidden", "false");
      inp.setAttribute("aria-expanded", "true");
      
      filtered.slice(0, 8).forEach((item, index) => {
        b = document.createElement("DIV");
        b.id = `${listId}-option-${index}`;
        b.setAttribute("role", "option");
        b.setAttribute("aria-selected", "false");
        b.dataset.value = item;
        
        // Bold the matching substring
        const matchIdx = item.toLowerCase().indexOf(val.toLowerCase());
        const start = item.slice(0, matchIdx);
        const match = item.slice(matchIdx, matchIdx + val.length);
        const end = item.slice(matchIdx + val.length);
        
        b.append(document.createTextNode(start));
        const strong = document.createElement("strong");
        strong.textContent = match;
        b.append(strong, document.createTextNode(end));
        
        b.addEventListener("click", function(e) {
          inp.value = this.dataset.value;
          closeAllLists();
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          // Trigger form update
          updateSummaryPreview();
        });
        a.appendChild(b);
      });
    });
    
    // Support keyboard navigation
    inp.addEventListener("keydown", function(e) {
      let x = document.getElementById(listId);
      if (x) x = x.getElementsByTagName("div");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        currentFocus++;
        addActive(x);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        currentFocus--;
        addActive(x);
      } else if (e.key === "Enter") {
        if (currentFocus > -1) {
          e.preventDefault();
          if (x) x[currentFocus].click();
        }
      } else if (e.key === "Escape") {
        closeAllLists();
      }
    });
    
    function addActive(x) {
      if (!x || x.length === 0) return false;
      removeActive(x);
      if (currentFocus >= x.length) currentFocus = 0;
      if (currentFocus < 0) currentFocus = (x.length - 1);
      x[currentFocus].classList.add("autocomplete-active");
      x[currentFocus].setAttribute("aria-selected", "true");
      inp.setAttribute("aria-activedescendant", x[currentFocus].id);
      
      x[currentFocus].scrollIntoView({ block: "nearest" });
    }
    
    function removeActive(x) {
      for (let i = 0; i < x.length; i++) {
        x[i].classList.remove("autocomplete-active");
        x[i].setAttribute("aria-selected", "false");
      }
      inp.removeAttribute("aria-activedescendant");
    }
    
    function closeAllLists(elmnt) {
      const x = document.getElementById(listId);
      if (x) {
        x.innerHTML = "";
        x.style.display = "none";
        x.setAttribute("aria-hidden", "true");
      }
      inp.setAttribute("aria-expanded", "false");
      inp.removeAttribute("aria-activedescendant");
    }
    
    // Close when clicking elsewhere
    document.addEventListener("click", function (e) {
      if (e.target != inp) {
        closeAllLists();
      }
    });
  }

  autocomplete(document.getElementById("part-name"), PARTS_DB, "part-autocomplete-list");
}

// Update KPI Widgets & Recent Requests on Dashboard
function updateDashboard() {
  const total = state.requests.length;
  const pending = state.requests.filter(r => r.status === "Pendente").length;
  const ordered = state.requests.filter(r => r.status === "Encomendado").length;
  const received = state.requests.filter(r => r.status === "Entregue").length;

  document.getElementById("kpi-total").textContent = total;
  document.getElementById("kpi-pending").textContent = pending;
  document.getElementById("kpi-ordered").textContent = ordered;
  document.getElementById("kpi-received").textContent = received;

  const todayStr = getLocalDateString(new Date());
  const repairsToday = (state.appointments || []).filter(
    a => a.scheduledDate === todayStr && a.status !== "Cancelado"
  );
  const repairsPendingToday = repairsToday.filter(
    a => a.status === "Agendado" || a.status === "Em Reparo"
  ).length;

  const kpiRepairsToday = document.getElementById("kpi-repairs-today");
  const kpiRepairsTodayPending = document.getElementById("kpi-repairs-today-pending");
  if (kpiRepairsToday) kpiRepairsToday.textContent = repairsToday.length;
  if (kpiRepairsTodayPending) kpiRepairsTodayPending.textContent = repairsPendingToday;

  const pctPendingEl = document.getElementById("pct-pending");
  if (pctPendingEl) {
    const pct = total > 0 ? Math.round((pending / total) * 100) : 0;
    pctPendingEl.textContent = pct;
  }

  // Populate Dashboard Table (Last 5 items)
  const recentTbody = document.getElementById("recent-requests-tbody");
  const recentMobileList = document.getElementById("recent-requests-mobile-list");
  if (!recentTbody) return;

  const recentGroups = groupRequests(state.requests).slice(0, 5);

  if (recentGroups.length === 0) {
    recentTbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="9" class="text-center">
          <div class="empty-state">
            <i data-lucide="clipboard-list"></i>
            <p>Nenhuma solicitação cadastrada.</p>
            <button class="btn btn-secondary btn-sm btn-new-req-shortcut" style="margin-top: 10px;">Solicitar Primeira Peça</button>
          </div>
        </td>
      </tr>
    `;
    if (recentMobileList) {
      recentMobileList.innerHTML = `
        <div class="empty-state compact-empty-state">
          <i data-lucide="clipboard-list"></i>
          <p>Nenhuma solicitação cadastrada.</p>
          <button class="btn btn-secondary btn-sm btn-new-req-shortcut">Solicitar Primeira Peça</button>
        </div>
      `;
      bindNewRequestShortcuts(recentMobileList);
    }
    lucide.createIcons();
    bindNewRequestShortcuts(recentTbody);
    return;
  }

  recentTbody.innerHTML = "";
  if (recentMobileList) {
    recentMobileList.innerHTML = renderRecentRequestCards(recentGroups);
  }
  
  recentGroups.forEach(group => {
    const N = group.items.length;
    
    group.items.forEach((req, i) => {
      const tr = document.createElement("tr");
      tr.className = "order-row";
      tr.setAttribute("data-order-id", group.orderId || group.key);
      
      if (i === 0) {
        tr.classList.add("order-row-first");
        if (N === 1) tr.classList.add("order-row-last");
      } else if (i === N - 1) {
        tr.classList.add("order-row-last");
      } else {
        tr.classList.add("order-row-middle");
      }

      const statusClass = req.status.toLowerCase();

      if (i === 0) {
        const dateFormatted = formatDashboardDate(group.createdAt);
        const urgencyClass = getUrgencyClass(group.urgency);

        tr.innerHTML = `
          <td rowspan="${N}" class="table-date-cell">${dateFormatted}</td>
          <td rowspan="${N}" class="table-client-cell">${escapeHtml(group.requester)}</td>
          <td rowspan="${N}" class="table-device-cell">
            <div style="font-weight: 600;">${group.deviceModel}</div>
            ${group.deviceModelCode ? `<div class="sub-detail" style="font-size: 11px; opacity: 0.85; margin-top: 2px;">Mód: ${escapeHtml(group.deviceModelCode)}</div>` : ""}
            ${group.imei ? `<div class="sub-detail" style="font-size: 11px; opacity: 0.85;">IMEI: ${escapeHtml(group.imei)}</div>` : ""}
          </td>
          <td class="table-part-cell">${req.partName}</td>
          <td class="table-qty-cell">${req.quantity}</td>
          <td rowspan="${N}" class="table-note-cell">${renderGroupNoteCell(group)}</td>
          <td rowspan="${N}">
            <span class="urgency-badge">
              <span class="urgency-dot ${urgencyClass}"></span>
              <span>${group.urgency}</span>
            </span>
          </td>
          <td><span class="badge ${statusClass}">${req.status}</span></td>
          <td class="table-action-cell">
            <div class="actions-cell">
              <button class="btn btn-secondary btn-icon-only btn-status-shortcut" data-id="${req.id}" title="Alterar Status" aria-label="Alterar status de ${escapeHtml(req.partName)}">
                <i data-lucide="edit-3"></i>
              </button>
            </div>
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td class="table-part-cell">${req.partName}</td>
          <td class="table-qty-cell">${req.quantity}</td>
          <td><span class="badge ${statusClass}">${req.status}</span></td>
          <td class="table-action-cell">
            <div class="actions-cell">
              <button class="btn btn-secondary btn-icon-only btn-status-shortcut" data-id="${req.id}" title="Alterar Status" aria-label="Alterar status de ${escapeHtml(req.partName)}">
                <i data-lucide="edit-3"></i>
              </button>
            </div>
          </td>
        `;
      }
      recentTbody.appendChild(tr);
    });
  });

  // Setup dashboard action buttons
  [recentTbody, recentMobileList].filter(Boolean).forEach(root => {
    root.querySelectorAll(".btn-status-shortcut").forEach(btn => {
      btn.addEventListener("click", () => {
        openStatusModal(btn.getAttribute("data-id"));
      });
    });
  });

  // Hover effect for grouped rows on dashboard
  const orderRows = recentTbody.querySelectorAll(".order-row");
  orderRows.forEach(row => {
    const orderId = row.getAttribute("data-order-id");
    if (!orderId) return;
    row.addEventListener("mouseenter", () => {
      recentTbody.querySelectorAll(`.order-row[data-order-id="${orderId}"]`).forEach(r => {
        r.classList.add("order-row-hover");
      });
    });
    row.addEventListener("mouseleave", () => {
      recentTbody.querySelectorAll(`.order-row[data-order-id="${orderId}"]`).forEach(r => {
        r.classList.remove("order-row-hover");
      });
    });
  });

  lucide.createIcons();
}

function renderRecentRequestCards(groups) {
  return groups.map(group => {
    const urgencyClass = getUrgencyClass(group.urgency);
    const deviceDetails = [
      group.deviceModelCode ? `Mod: ${escapeHtml(group.deviceModelCode)}` : "",
      group.imei ? `IMEI: ${escapeHtml(group.imei)}` : ""
    ].filter(Boolean).join(" | ");
    const creationNotes = (group.creationNotes || "").trim();
    const statusNotes = (group.statusNotes || "").trim();
    const parts = group.items.map(req => {
      const statusClass = req.status.toLowerCase();
      return `
        <li class="recent-request-part">
          <div class="recent-part-main">
            <span class="recent-part-name">${escapeHtml(req.partName)}</span>
            <span class="recent-part-qty">Qtd ${escapeHtml(req.quantity)}</span>
          </div>
          <div class="recent-part-meta">
            <span class="badge ${statusClass}">${escapeHtml(req.status)}</span>
            <button class="btn btn-secondary btn-icon-only btn-status-shortcut" data-id="${escapeHtml(req.id)}" title="Alterar Status" aria-label="Alterar status de ${escapeHtml(req.partName)}">
              <i data-lucide="edit-3"></i>
            </button>
          </div>
        </li>
      `;
    }).join("");

    return `
      <article class="recent-request-card">
        <div class="recent-request-top">
          <div class="recent-request-heading">
            <span class="recent-request-client">${escapeHtml(group.requester)}</span>
            <span class="recent-request-date">${formatDashboardDate(group.createdAt)}</span>
          </div>
          <span class="urgency-badge">
            <span class="urgency-dot ${urgencyClass}"></span>
            <span>${escapeHtml(group.urgency)}</span>
          </span>
        </div>

        <div class="recent-request-device">
          <span class="recent-request-device-name">${escapeHtml(group.deviceModel)}</span>
          ${deviceDetails ? `<span class="recent-request-device-details">${deviceDetails}</span>` : ""}
        </div>

        ${creationNotes || statusNotes ? `
          <div class="recent-request-notes">
            ${creationNotes ? `<p class="recent-request-note"><span class="note-label">Obs:</span> ${escapeHtml(creationNotes)}</p>` : ""}
            ${statusNotes ? `<p class="recent-request-note note-status"><span class="note-label">Status:</span> ${escapeHtml(statusNotes)}</p>` : ""}
          </div>
        ` : ""}

        <ul class="recent-request-parts">
          ${parts}
        </ul>
      </article>
    `;
  }).join("");
}

function getFilteredRequests() {
  const searchInp = document.getElementById("search-history");
  if (!searchInp) return state.requests;

  const searchQuery = searchInp.value.toLowerCase().trim();
  const statusFilter = document.getElementById("filter-status").value;
  const urgencyFilter = document.getElementById("filter-urgency").value;

  return state.requests.filter(req => {
    // Search filter
    const matchesSearch = 
      req.deviceModel.toLowerCase().includes(searchQuery) ||
      (req.deviceModelCode && req.deviceModelCode.toLowerCase().includes(searchQuery)) ||
      (req.imei && req.imei.toLowerCase().includes(searchQuery)) ||
      req.partName.toLowerCase().includes(searchQuery) ||
      req.requester.toLowerCase().includes(searchQuery) ||
      getRequestDisplayNotes(req).toLowerCase().includes(searchQuery);

    // Status filter
    const matchesStatus = statusFilter === "todos" || req.status === statusFilter;

    // Urgency filter
    const matchesUrgency = urgencyFilter === "todos" || req.urgency === urgencyFilter;

    return matchesSearch && matchesStatus && matchesUrgency;
  });
}

// History Filters & Full Listing
function setupHistoryFilters() {
  const searchInp = document.getElementById("search-history");
  const filterStatus = document.getElementById("filter-status");
  const filterUrgency = document.getElementById("filter-urgency");
  const btnClear = document.getElementById("btn-clear-filters");

  const triggerFilters = () => {
    renderHistoryTable();
  };

  if (searchInp) searchInp.addEventListener("input", triggerFilters);
  if (filterStatus) filterStatus.addEventListener("change", triggerFilters);
  if (filterUrgency) filterUrgency.addEventListener("change", triggerFilters);

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      searchInp.value = "";
      filterStatus.value = "todos";
      filterUrgency.value = "todos";
      renderHistoryTable();
      showToast("Filtros limpos", "info");
    });
  }

  // Setup Bulk Action Button
  const btnBulk = document.getElementById("btn-bulk-status-change");
  if (btnBulk) {
    btnBulk.addEventListener("click", () => {
      openBulkStatusModal();
    });
  }

  // Setup Export CSV Button in History
  const btnExportHistoryCsv = document.getElementById("btn-export-history-csv");
  if (btnExportHistoryCsv) {
    btnExportHistoryCsv.addEventListener("click", () => {
      const filtered = getFilteredRequests();
      if (filtered.length === 0) {
        showToast("Não há solicitações correspondentes aos filtros para exportar.", "warning");
        return;
      }
      downloadCSV(filtered, "partsync_historico_filtrado");
    });
  }
}

function groupRequests(requestsList) {
  const groups = [];
  const groupMap = new Map();

  requestsList.forEach(req => {
    let key = req.orderId;
    if (!key) {
      const timeKey = Math.floor(new Date(req.createdAt).getTime() / 10000);
      key = `legacy_${req.requester}_${req.deviceModel}_${req.urgency}_${timeKey}`;
    }

    if (!groupMap.has(key)) {
      const group = {
        key: key,
        orderId: req.orderId || "",
        createdAt: req.createdAt,
        requester: req.requester,
        deviceModel: req.deviceModel,
        deviceModelCode: req.deviceModelCode || "",
        imei: req.imei || "",
        urgency: req.urgency,
        creationNotes: "",
        statusNotes: "",
        items: []
      };
      groupMap.set(key, group);
      groups.push(group);
    }
    const group = groupMap.get(key);
    group.creationNotes = appendUniqueNote(group.creationNotes, getCreationNote(req));
    group.statusNotes = appendUniqueNote(group.statusNotes, getStatusNote(req));
    group.items.push(req);
  });

  return groups;
}

function renderHistoryTable() {
  const tbody = document.getElementById("history-tbody");
  if (!tbody) return;

  // Filter requests
  const filtered = getFilteredRequests();
  const groups = groupRequests(filtered);

  if (groups.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center">
          <div class="empty-state">
            <i data-lucide="filter"></i>
            <p>Nenhuma solicitação corresponde aos filtros aplicados.</p>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = "";

  groups.forEach(group => {
    const N = group.items.length;
    
    group.items.forEach((req, i) => {
      const tr = document.createElement("tr");
      tr.className = "order-row";
      tr.setAttribute("data-order-id", group.orderId || group.key);

      if (i === 0) {
        tr.classList.add("order-row-first");
        if (N === 1) tr.classList.add("order-row-last");
      } else if (i === N - 1) {
        tr.classList.add("order-row-last");
      } else {
        tr.classList.add("order-row-middle");
      }

      const statusClass = req.status.toLowerCase();

      if (i === 0) {
        const dateObj = new Date(group.createdAt);
        const dateFormatted = dateObj.toLocaleDateString("pt-BR") + " " + dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const urgencyClass = group.urgency.toLowerCase() === "baixa" ? "low" : group.urgency.toLowerCase() === "média" ? "medium" : "high";

        tr.innerHTML = `
          <td rowspan="${N}">${dateFormatted}</td>
          <td rowspan="${N}">${group.requester}</td>
          <td rowspan="${N}">
            <div style="font-weight: 600;">${group.deviceModel}</div>
          </td>
          <td rowspan="${N}">${group.deviceModelCode ? escapeHtml(group.deviceModelCode) : "-"}</td>
          <td rowspan="${N}">${group.imei ? escapeHtml(group.imei) : "-"}</td>
          <td>${req.partName}</td>
          <td>${req.quantity}</td>
          <td rowspan="${N}">
            <span class="urgency-badge">
              <span class="urgency-dot ${urgencyClass}"></span>
              <span>${group.urgency}</span>
            </span>
          </td>
          <td><span class="badge ${statusClass}">${req.status}</span></td>
          <td>
            <div class="actions-cell">
              ${req.status === "Entregue" ? `
                <button class="btn btn-secondary btn-icon-only btn-schedule-shortcut" data-id="${req.id}" title="Agendar Reparo no Calendário" style="color: #06b6d4;">
                  <i data-lucide="calendar-plus"></i>
                </button>
              ` : ""}
              <button class="btn btn-secondary btn-icon-only btn-status-shortcut" data-id="${req.id}" title="Alterar Status">
                <i data-lucide="edit-3"></i>
              </button>
              <button class="btn btn-secondary btn-icon-only btn-copy-shortcut" data-id="${req.id}" data-is-group="true" data-group-key="${group.key}" title="Copiar Ficha Técnica do Pedido">
                <i data-lucide="copy"></i>
              </button>
              <button class="btn btn-danger btn-icon-only btn-delete-shortcut" data-id="${req.id}" title="Excluir">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        `;
      } else {
        tr.innerHTML = `
          <td>${req.partName}</td>
          <td>${req.quantity}</td>
          <td><span class="badge ${statusClass}">${req.status}</span></td>
          <td>
            <div class="actions-cell">
              ${req.status === "Entregue" ? `
                <button class="btn btn-secondary btn-icon-only btn-schedule-shortcut" data-id="${req.id}" title="Agendar Reparo no Calendário" style="color: #06b6d4;">
                  <i data-lucide="calendar-plus"></i>
                </button>
              ` : ""}
              <button class="btn btn-secondary btn-icon-only btn-status-shortcut" data-id="${req.id}" title="Alterar Status">
                <i data-lucide="edit-3"></i>
              </button>
              <button class="btn btn-danger btn-icon-only btn-delete-shortcut" data-id="${req.id}" title="Excluir">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </td>
        `;
      }
      tbody.appendChild(tr);
    });
  });

  // Hook actions
  tbody.querySelectorAll(".btn-schedule-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      const reqId = btn.getAttribute("data-id");
      const calNav = document.querySelector('.nav-item[data-target="calendar"], .mobile-nav-item[data-target="calendar"]');
      if (calNav) calNav.click();
      openNewAppointmentModal({ requestId: reqId });
    });
  });

  tbody.querySelectorAll(".btn-status-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      openStatusModal(btn.getAttribute("data-id"));
    });
  });

  tbody.querySelectorAll(".btn-copy-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      const isGroup = btn.getAttribute("data-is-group") === "true";
      if (isGroup) {
        const groupKey = btn.getAttribute("data-group-key");
        const group = groups.find(g => g.key === groupKey);
        if (group) {
          const formattedDate = new Date(group.createdAt).toLocaleDateString("pt-BR") + " " + 
                                new Date(group.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          
          const parts = group.items.map(item => ({
            name: item.partName,
            quantity: item.quantity
          }));
          
          const text = generateSummaryText({
            date: formattedDate,
            requester: group.requester,
            deviceModel: group.deviceModel,
            deviceModelCode: group.deviceModelCode,
            imei: group.imei,
            urgency: group.urgency,
            notes: [group.creationNotes, group.statusNotes].filter(Boolean).join("\n"),
            parts: parts
          });
          
          navigator.clipboard.writeText(text)
            .then(() => showToast("Ficha técnica do pedido copiada!"))
            .catch(() => showToast("Erro ao copiar.", "error"));
        }
      } else {
        const req = state.requests.find(r => r.id === btn.getAttribute("data-id"));
        if (req) {
          const formattedDate = new Date(req.createdAt).toLocaleDateString("pt-BR") + " " + 
                                new Date(req.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          const text = generateSummaryText({
            ...req,
            date: formattedDate,
            notes: getRequestDisplayNotes(req)
          });
          navigator.clipboard.writeText(text)
            .then(() => showToast("Ficha técnica copiada!"))
            .catch(() => showToast("Erro ao copiar.", "error"));
        }
      }
    });
  });

  tbody.querySelectorAll(".btn-delete-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      void deleteRequest(btn.getAttribute("data-id"));
    });
  });

  // Hover effect for grouped rows
  const orderRows = tbody.querySelectorAll(".order-row");
  orderRows.forEach(row => {
    const orderId = row.getAttribute("data-order-id");
    if (!orderId) return;
    row.addEventListener("mouseenter", () => {
      tbody.querySelectorAll(`.order-row[data-order-id="${orderId}"]`).forEach(r => {
        r.classList.add("order-row-hover");
      });
    });
    row.addEventListener("mouseleave", () => {
      tbody.querySelectorAll(`.order-row[data-order-id="${orderId}"]`).forEach(r => {
        r.classList.remove("order-row-hover");
      });
    });
  });

  lucide.createIcons();
}

async function deleteRequest(id) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;

  if (confirm(`Tem certeza que deseja excluir o registro de "${req.partName}" para "${req.deviceModel}"?`)) {
    state.requests = state.requests.filter(r => r.id !== id);
    if (!(await saveRequests())) return;
    showToast("Registro excluído com sucesso.", "info");
    renderHistoryTable();
  }
}

// Modal Handlers
function setupModals() {
  const modals = document.querySelectorAll(".modal");
  
  // Close buttons
  document.querySelectorAll(".close-modal").forEach(btn => {
    btn.addEventListener("click", () => {
      modals.forEach(m => m.classList.remove("active"));
    });
  });

  // Click outside modal content closes it
  modals.forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("active");
      }
    });
  });
}

// Open Status Update Modal
function openStatusModal(id) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;

  const modal = document.getElementById("status-modal");
  document.getElementById("modal-req-id").value = req.id;
  
  const createdDate = new Date(req.createdAt).toLocaleDateString("pt-BR") + " " + new Date(req.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  
  const creationNote = getCreationNote(req);

  document.getElementById("modal-req-summary").innerHTML = `
    <strong>Dispositivo:</strong> ${req.deviceModel} <br>
    ${req.deviceModelCode ? `<strong>Modelo Específico:</strong> ${req.deviceModelCode} <br>` : ""}
    ${req.imei ? `<strong>IMEI:</strong> ${req.imei} <br>` : ""}
    <strong>Peça:</strong> ${req.partName} (Qtd: ${req.quantity}) <br>
    <strong>Cliente:</strong> ${req.requester} em ${createdDate} <br>
    <strong>Status Atual:</strong> ${req.status}
    ${creationNote ? `<br><strong>Obs. de Criação:</strong> <span style="color: var(--text-secondary);">${escapeHtml(creationNote)}</span>` : ""}
  `;

  document.getElementById("modal-status-select").value = req.status;
  document.getElementById("modal-notes-append").value = getStatusNote(req);

  modal.classList.add("active");

  // Hook submit status button (remove old event listener)
  const saveBtn = document.getElementById("btn-save-status-change");
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener("click", () => {
    void saveStatusChange(id);
  });
}

async function saveStatusChange(id) {
  const newStatus = document.getElementById("modal-status-select").value;
  const appendNotes = document.getElementById("modal-notes-append").value.trim();
  
  const reqIndex = state.requests.findIndex(r => r.id === id);
  if (reqIndex === -1) return;

  const now = new Date();
  
  state.requests[reqIndex].status = newStatus;
  
  // Create history log entry
  const logEntry = {
    timestamp: now.toISOString(),
    status: newStatus,
    notes: appendNotes || `Status alterado para ${newStatus}`
  };
  
  if (!state.requests[reqIndex].logs) {
    state.requests[reqIndex].logs = [];
  }
  
  state.requests[reqIndex].logs.push(logEntry);
  
  if (!(await saveRequests())) return;
  
  // Close modal
  document.getElementById("status-modal").classList.remove("active");
  
  showToast(`Status atualizado para "${newStatus}"!`);
  
  // Re-render appropriate view
  const currentActiveSection = document.querySelector(".content-section.active").id;
  if (currentActiveSection === "history") {
    renderHistoryTable();
  } else {
    updateDashboard();
  }
}

// Bulk Status Modal Logic
function openBulkStatusModal() {
  // We can show all requests that are not delivered yet, or show all requests. Let's show all requests that are not completed (Pending/Ordered)
  const activeReqs = state.requests.filter(r => r.status === "Pendente" || r.status === "Encomendado");
  
  if (activeReqs.length === 0) {
    showToast("Não há nenhuma solicitação em aberto (Pendente ou Encomendada) no histórico.", "warning");
    return;
  }

  const modal = document.getElementById("bulk-status-modal");
  const listContainer = document.getElementById("bulk-pending-list");
  
  listContainer.innerHTML = "";
  
  activeReqs.forEach((req, idx) => {
    const row = document.createElement("div");
    row.className = "bulk-item-row";
    row.innerHTML = `
      <div class="bulk-item-info">
        <span class="bulk-item-device">${req.deviceModel} (x${req.quantity})</span>
        <span class="bulk-item-part">${req.partName} [Status: ${req.status}]</span>
      </div>
      <input type="checkbox" class="bulk-status-checkbox" data-id="${req.id}" checked style="width: 18px; height: 18px; cursor: pointer;">
    `;
    listContainer.appendChild(row);
  });

  // Default values
  document.getElementById("bulk-status-select").value = "Encomendado";
  document.getElementById("bulk-notes-append").value = "";

  modal.classList.add("active");

  // Hook Bulk Status Save button (recreating node to avoid duplicated event listeners)
  const confirmBtn = document.getElementById("btn-confirm-bulk-status");
  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

  newConfirmBtn.addEventListener("click", () => {
    void saveBulkStatusChange();
  });
}

async function saveBulkStatusChange() {
  const checkboxes = document.querySelectorAll(".bulk-status-checkbox:checked");
  const selectedIds = Array.from(checkboxes).map(chk => chk.getAttribute("data-id"));
  
  if (selectedIds.length === 0) {
    showToast("Por favor, selecione ao menos uma solicitação para atualizar.", "warning");
    return;
  }

  const newStatus = document.getElementById("bulk-status-select").value;
  const noteText = document.getElementById("bulk-notes-append").value.trim();
  const now = new Date();

  selectedIds.forEach(id => {
    const idx = state.requests.findIndex(r => r.id === id);
    if (idx !== -1) {
      state.requests[idx].status = newStatus;
      if (!state.requests[idx].logs) state.requests[idx].logs = [];
      state.requests[idx].logs.push({
        timestamp: now.toISOString(),
        status: newStatus,
        notes: noteText || `Atualização em lote para status ${newStatus}`
      });
    }
  });

  if (!(await saveRequests())) return;
  showToast(`${selectedIds.length} solicitações atualizadas para "${newStatus}"!`);
  
  // Close modal
  document.getElementById("bulk-status-modal").classList.remove("active");
  renderHistoryTable();
}

// Settings Panel Logic
// Settings Panel Logic
function setupSettingsEventListeners() {
  renderTechniciansManager();

  const btnAddTech = document.getElementById("btn-add-technician");
  if (btnAddTech) {
    btnAddTech.addEventListener("click", async () => {
      const input = document.getElementById("new-technician-name");
      const name = input ? input.value.trim() : "";
      if (!name) {
        showToast("Digite o nome do técnico.", "warning");
        return;
      }
      if (!Array.isArray(state.settings.technicians)) {
        state.settings.technicians = [];
      }
      if (state.settings.technicians.includes(name)) {
        showToast("Este técnico já está cadastrado.", "warning");
        return;
      }
      state.settings.technicians.push(name);
      try {
        await api.saveSettings(state.settings);
        input.value = "";
        renderTechniciansManager();
        renderCalendar();
        showToast(`Técnico "${name}" adicionado com sucesso!`);
      } catch (err) {
        console.error(err);
        showToast("Erro ao salvar configurações.", "error");
      }
    });
  }

  // Backup: Export CSV
  document.getElementById("btn-export-data").addEventListener("click", () => {
    downloadCSV(state.requests, "partsync_solicitacoes_backup");
  });

  // Redefine / Clear App
  document.getElementById("btn-reset-app").addEventListener("click", async () => {
    if (confirm("ATENÇÃO: Isso irá APAGAR TODO o seu histórico do PartSync permanentemente. Continuar?")) {
      if (confirm("Confirmação final: Deseja mesmo deletar todos os dados?")) {
        try {
          await api.resetData();
          localStorage.removeItem("partsync_requests");
          localStorage.removeItem("partsync_settings");
        } catch (error) {
          console.error(error);
          showToast("Erro ao limpar banco SQLite.", "error");
          return;
        }

        state.requests = [];
        state.appointments = [];
        state.settings = {
          defaultRequester: "",
          technicians: ["Técnico 1", "Técnico 2"]
        };
        
        document.getElementById("requester-name").value = "";
        
        updateDashboard();
        renderHistoryTable();
        renderCalendar();
        renderPendingArrivedParts();
        showToast("Aplicativo redefinido para o estado original.", "info");
        
        setTimeout(() => {
          window.location.hash = "dashboard";
          window.location.reload();
        }, 1000);
      }
    }
  });
}

function renderTechniciansManager() {
  const container = document.getElementById("technicians-chips-list");
  if (!container) return;

  const techs = Array.isArray(state.settings.technicians) ? state.settings.technicians : [];
  if (techs.length === 0) {
    container.innerHTML = '<span class="text-muted" style="font-size: 0.85rem;">Nenhum técnico cadastrado.</span>';
    return;
  }

  container.innerHTML = techs.map((tech, idx) => `
    <div class="tech-chip">
      <span>${escapeHtml(tech)}</span>
      <button type="button" class="tech-chip-remove" data-index="${idx}" title="Remover ${escapeHtml(tech)}">&times;</button>
    </div>
  `).join("");

  container.querySelectorAll(".tech-chip-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.getAttribute("data-index"));
      const removed = state.settings.technicians.splice(idx, 1)[0];
      try {
        await api.saveSettings(state.settings);
        renderTechniciansManager();
        renderCalendar();
        showToast(`Técnico "${removed}" removido.`);
      } catch (err) {
        console.error(err);
        showToast("Erro ao remover técnico.", "error");
      }
    });
  });
}

// Reusable function to export requests to CSV
function downloadCSV(requests, filenamePrefix = "partsync_solicitacoes") {
  if (requests.length === 0) {
    showToast("Não há solicitações registradas para exportar.", "warning");
    return;
  }

  // CSV Headers
  const headers = ["ID", "Data/Hora", "Cliente", "Aparelho", "Modelo Específico", "IMEI", "Peça", "Quantidade", "Urgência", "Status", "Obs. de Criação", "Nota de Status"];
  
  // Convert to CSV lines
  const csvRows = [];
  csvRows.push(headers.join(";")); // Semicolon as separator (Excel friendly in Brazil)

  requests.forEach(req => {
    const dateObj = new Date(req.createdAt);
    const dateFormatted = dateObj.toLocaleDateString("pt-BR") + " " + dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const creationClean = getCreationNote(req).replace(/\r?\n|\r/g, " ");
    const statusClean = getStatusNote(req).replace(/\r?\n|\r/g, " ");

    const values = [
      req.id,
      dateFormatted,
      req.requester,
      req.deviceModel,
      req.deviceModelCode || "",
      req.imei || "",
      req.partName,
      req.quantity,
      req.urgency,
      req.status,
      creationClean,
      statusClean
    ];

    // Escape double quotes and wrap values in quotes
    const escapedValues = values.map(val => {
      const valStr = String(val);
      const escaped = valStr.replace(/"/g, '""');
      return `"${escaped}"`;
    });

    csvRows.push(escapedValues.join(";"));
  });

  // Add UTF-8 BOM (\ufeff) to make Excel parse special characters (like ç, ã) correctly in Portuguese
  const csvContent = "\ufeff" + csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const dateStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0');
  
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", url);
  downloadAnchor.setAttribute("download", `${filenamePrefix}_${dateStr}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  
  showToast("Relatório CSV baixado com sucesso!");
}

/* ==========================================================================
   CALENDAR & REPAIR SCHEDULING LOGIC
   ========================================================================== */

function getLocalDateString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateDisplayPt(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const monthName = d.toLocaleDateString("pt-BR", { month: "long" });
  return `${capitalizedWeekday}, ${day} de ${monthName} de ${year}`;
}

function calculateEndTime(startTime, durationMinutes) {
  const parts = String(startTime || "08:00").split(":");
  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  const totalMinutes = hours * 60 + minutes + (Number(durationMinutes) || 60);
  const endHours = Math.floor(totalMinutes / 60);
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}

function checkAppointmentConflict(candidate, excludeId = null) {
  const { scheduledDate, technician, startTime, endTime } = candidate;
  return (state.appointments || []).find(a => {
    if (a.id === excludeId) return false;
    if (a.status === "Cancelado") return false;
    if (a.scheduledDate !== scheduledDate) return false;
    if (a.technician !== technician) return false;

    // Overlap condition
    return a.startTime < endTime && a.endTime > startTime;
  });
}

function renderPendingArrivedParts() {
  const listEl = document.getElementById("pending-repairs-list");
  const badgeEl = document.getElementById("pending-repairs-badge");
  if (!listEl) return;

  const delivered = state.requests.filter(r => r.status === "Entregue");
  const unscheduled = delivered.filter(r => {
    return !state.appointments.some(a => a.requestId === r.id && a.status !== "Cancelado");
  });

  if (badgeEl) badgeEl.textContent = unscheduled.length;

  if (unscheduled.length === 0) {
    listEl.innerHTML = `
      <div class="pending-empty-state">
        <i data-lucide="check-circle-2" style="width: 24px; height: 24px; margin-bottom: 6px; color: var(--status-received);"></i>
        <p>Nenhuma peça entregue pendente de agendamento.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  listEl.innerHTML = unscheduled.map(req => `
    <div class="pending-repair-card">
      <div class="pending-repair-top">
        <span class="pending-repair-client">${escapeHtml(req.requester)}</span>
        <span class="badge received">Chegou</span>
      </div>
      <div class="pending-repair-part">${escapeHtml(req.partName)} (x${req.quantity})</div>
      <div class="pending-repair-meta">
        <span>${escapeHtml(req.deviceModel)}</span>
        ${req.orderId ? `<span>O.S. #${escapeHtml(req.orderId)}</span>` : ""}
      </div>
      <button type="button" class="btn-schedule-item btn-schedule-part-direct" data-req-id="${escapeHtml(req.id)}">
        <i data-lucide="calendar-plus"></i> Agendar Reparo
      </button>
    </div>
  `).join("");

  listEl.querySelectorAll(".btn-schedule-part-direct").forEach(btn => {
    btn.addEventListener("click", () => {
      const reqId = btn.getAttribute("data-req-id");
      openNewAppointmentModal({ requestId: reqId });
    });
  });

  lucide.createIcons();
}

function renderCalendar() {
  const dateLabel = document.getElementById("calendar-current-date-label");
  if (dateLabel) {
    dateLabel.textContent = formatDateDisplayPt(calendarState.selectedDate);
  }

  const dateInput = document.getElementById("calendar-date-input");
  if (dateInput) {
    dateInput.value = calendarState.selectedDate;
  }

  // Technician Filter
  const techFilter = document.getElementById("calendar-tech-filter");
  if (techFilter) {
    const techs = Array.isArray(state.settings.technicians) && state.settings.technicians.length > 0
      ? state.settings.technicians
      : ["Técnico 1", "Técnico 2"];

    techFilter.innerHTML = `<option value="all">Todos os Técnicos</option>` +
      techs.map(t => `<option value="${escapeHtml(t)}" ${calendarState.selectedTechnician === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("");
  }

  // View toggle buttons
  const btnDaily = document.getElementById("btn-view-daily");
  const btnWeekly = document.getElementById("btn-view-weekly");
  if (btnDaily && btnWeekly) {
    if (calendarState.currentView === "daily") {
      btnDaily.classList.add("active");
      btnWeekly.classList.remove("active");
    } else {
      btnDaily.classList.remove("active");
      btnWeekly.classList.add("active");
    }
  }

  if (calendarState.currentView === "daily") {
    renderDailyCalendar();
  } else {
    renderWeeklyCalendar();
  }
}

function getAppointmentStatusSlug(status) {
  return String(status || "Agendado")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
}

function renderDailyCalendar() {
  const boardEl = document.getElementById("calendar-board");
  if (!boardEl) return;

  const techs = Array.isArray(state.settings.technicians) && state.settings.technicians.length > 0
    ? state.settings.technicians
    : ["Técnico 1", "Técnico 2"];

  const techsToShow = calendarState.selectedTechnician === "all"
    ? techs
    : techs.filter(t => t === calendarState.selectedTechnician);

  if (techsToShow.length === 0 && techs.length > 0) {
    techsToShow.push(techs[0]);
  }

  // 20 time slots (08:00 to 17:30, ending at 18:00)
  const timeSlots = [];
  for (let hour = 8; hour < 18; hour++) {
    timeSlots.push(`${String(hour).padStart(2, "0")}:00`);
    timeSlots.push(`${String(hour).padStart(2, "0")}:30`);
  }

  // Header row
  let headerHtml = `
    <div class="board-header-row">
      <div class="board-time-header">Horário</div>
  `;

  techsToShow.forEach(tech => {
    const techAppsToday = (state.appointments || []).filter(
      a => a.scheduledDate === calendarState.selectedDate && a.technician === tech && a.status !== "Cancelado"
    );
    const initials = tech.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || "T";
    headerHtml += `
      <div class="board-col-header">
        <div class="tech-header-info">
          <div class="tech-avatar">${escapeHtml(initials)}</div>
          <span class="tech-name">${escapeHtml(tech)}</span>
        </div>
        <span class="tech-count-badge">${techAppsToday.length} reparo${techAppsToday.length === 1 ? "" : "s"}</span>
      </div>
    `;
  });
  headerHtml += `</div>`;

  // Body row
  let bodyHtml = `<div class="board-body">`;

  // Time Ruler Column
  bodyHtml += `<div class="time-ruler-col">`;
  timeSlots.forEach(slot => {
    const isHour = slot.endsWith(":00");
    bodyHtml += `
      <div class="time-slot-label ${isHour ? "hour-mark" : ""}">
        ${isHour ? slot : ""}
      </div>
    `;
  });
  bodyHtml += `</div>`;

  // Columns for each technician
  techsToShow.forEach(tech => {
    bodyHtml += `<div class="tech-schedule-col" data-technician="${escapeHtml(tech)}">`;

    // Clickable grid slots
    timeSlots.forEach(slot => {
      const isHour = slot.endsWith(":00");
      bodyHtml += `
        <div class="grid-slot ${isHour ? "hour-mark" : ""}" data-time="${slot}" data-technician="${escapeHtml(tech)}" title="Clique para agendar às ${slot} com ${escapeHtml(tech)}"></div>
      `;
    });

    // Appointment cards for this technician
    const techApps = (state.appointments || []).filter(
      a => a.scheduledDate === calendarState.selectedDate && a.technician === tech
    );

    techApps.forEach(app => {
      const [startH, startM] = app.startTime.split(":").map(Number);
      const minutesFrom8 = (startH - 8) * 60 + startM;
      if (minutesFrom8 < 0 || minutesFrom8 >= 600) return;

      const topPx = (minutesFrom8 / 30) * 44;
      const durationMin = Number(app.durationMinutes) || 60;
      const heightPx = Math.max((durationMin / 30) * 44 - 4, 38);

      const statusSlug = getAppointmentStatusSlug(app.status);
      const statusBadgeClass = `badge-${statusSlug}`;

      bodyHtml += `
        <div class="appointment-card app-status-${statusSlug}"
             style="top: ${topPx}px; height: ${heightPx}px;"
             data-app-id="${escapeHtml(app.id)}"
             title="${escapeHtml(app.clientName)} - ${escapeHtml(app.deviceModel)} (${escapeHtml(app.partName)})">
          <div class="app-card-time">
            <i data-lucide="clock" style="width: 12px; height: 12px;"></i>
            <span>${escapeHtml(app.startTime)} - ${escapeHtml(app.endTime)}</span>
          </div>
          <div class="app-card-client">${escapeHtml(app.clientName)}</div>
          <div class="app-card-device">${escapeHtml(app.deviceModel)}</div>
          <div class="app-card-part">${escapeHtml(app.partName)}</div>
          <span class="app-card-badge ${statusBadgeClass}">${escapeHtml(app.status)}</span>
        </div>
      `;
    });

    bodyHtml += `</div>`;
  });

  bodyHtml += `</div>`;

  boardEl.innerHTML = headerHtml + bodyHtml;

  // Listeners for empty slot clicks
  boardEl.querySelectorAll(".grid-slot").forEach(slot => {
    slot.addEventListener("click", () => {
      const time = slot.getAttribute("data-time");
      const tech = slot.getAttribute("data-technician");
      openNewAppointmentModal({
        scheduledDate: calendarState.selectedDate,
        startTime: time,
        technician: tech
      });
    });
  });

  // Listeners for card clicks
  boardEl.querySelectorAll(".appointment-card").forEach(card => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      const appId = card.getAttribute("data-app-id");
      const app = state.appointments.find(a => a.id === appId);
      if (app) openAppointmentDetailsModal(app);
    });
  });

  lucide.createIcons();
}

function renderWeeklyCalendar() {
  const boardEl = document.getElementById("calendar-board");
  if (!boardEl) return;

  const [year, month, day] = calendarState.selectedDate.split("-").map(Number);
  const curr = new Date(year, month - 1, day);
  const dayOfWeek = curr.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(curr);
  monday.setDate(curr.getDate() + diffToMonday);

  const weekDays = [];
  const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = getLocalDateString(d);
    weekDays.push({
      dateStr,
      dayNumber: d.getDate(),
      dayName: dayNames[i],
      isToday: dateStr === getLocalDateString(new Date())
    });
  }

  const timeSlots = [];
  for (let hour = 8; hour < 18; hour++) {
    timeSlots.push(`${String(hour).padStart(2, "0")}:00`);
    timeSlots.push(`${String(hour).padStart(2, "0")}:30`);
  }

  let headerHtml = `
    <div class="board-header-row">
      <div class="board-time-header">Horário</div>
  `;

  weekDays.forEach(w => {
    headerHtml += `
      <div class="board-col-header weekly-col-header ${w.isToday ? "is-today" : ""}">
        <span class="weekly-day-name">${w.dayName}</span>
        <span class="weekly-day-number">${w.dayNumber}</span>
      </div>
    `;
  });
  headerHtml += `</div>`;

  let bodyHtml = `<div class="board-body">`;

  // Time ruler
  bodyHtml += `<div class="time-ruler-col">`;
  timeSlots.forEach(slot => {
    const isHour = slot.endsWith(":00");
    bodyHtml += `<div class="time-slot-label ${isHour ? "hour-mark" : ""}">${isHour ? slot : ""}</div>`;
  });
  bodyHtml += `</div>`;

  // Days columns
  weekDays.forEach(w => {
    bodyHtml += `<div class="tech-schedule-col" data-date="${w.dateStr}">`;

    timeSlots.forEach(slot => {
      const isHour = slot.endsWith(":00");
      bodyHtml += `
        <div class="grid-slot ${isHour ? "hour-mark" : ""}" data-time="${slot}" data-date="${w.dateStr}" title="Clique para agendar em ${w.dateStr} às ${slot}"></div>
      `;
    });

    const dayApps = (state.appointments || []).filter(a => {
      if (a.scheduledDate !== w.dateStr) return false;
      if (calendarState.selectedTechnician !== "all" && a.technician !== calendarState.selectedTechnician) return false;
      return true;
    });

    dayApps.forEach(app => {
      const [startH, startM] = app.startTime.split(":").map(Number);
      const minutesFrom8 = (startH - 8) * 60 + startM;
      if (minutesFrom8 < 0 || minutesFrom8 >= 600) return;

      const topPx = (minutesFrom8 / 30) * 44;
      const durationMin = Number(app.durationMinutes) || 60;
      const heightPx = Math.max((durationMin / 30) * 44 - 4, 38);

      const statusSlug = getAppointmentStatusSlug(app.status);
      const statusBadgeClass = `badge-${statusSlug}`;

      bodyHtml += `
        <div class="appointment-card app-status-${statusSlug}"
             style="top: ${topPx}px; height: ${heightPx}px;"
             data-app-id="${escapeHtml(app.id)}"
             title="${escapeHtml(app.clientName)} - ${escapeHtml(app.deviceModel)} (${escapeHtml(app.technician)})">
          <div class="app-card-time">
            <span>${escapeHtml(app.startTime)}</span>
            <span style="opacity: 0.8; font-size: 0.7rem;">(${escapeHtml(app.technician)})</span>
          </div>
          <div class="app-card-client">${escapeHtml(app.clientName)}</div>
          <div class="app-card-part">${escapeHtml(app.partName)}</div>
          <span class="app-card-badge ${statusBadgeClass}">${escapeHtml(app.status)}</span>
        </div>
      `;
    });

    bodyHtml += `</div>`;
  });

  bodyHtml += `</div>`;

  boardEl.innerHTML = headerHtml + bodyHtml;

  boardEl.querySelectorAll(".grid-slot").forEach(slot => {
    slot.addEventListener("click", () => {
      const time = slot.getAttribute("data-time");
      const date = slot.getAttribute("data-date");
      openNewAppointmentModal({
        scheduledDate: date,
        startTime: time,
        technician: calendarState.selectedTechnician !== "all" ? calendarState.selectedTechnician : undefined
      });
    });
  });

  boardEl.querySelectorAll(".appointment-card").forEach(card => {
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      const appId = card.getAttribute("data-app-id");
      const app = state.appointments.find(a => a.id === appId);
      if (app) openAppointmentDetailsModal(app);
    });
  });

  lucide.createIcons();
}

function setupCalendarEventListeners() {
  const btnPrev = document.getElementById("btn-cal-prev");
  const btnNext = document.getElementById("btn-cal-next");
  const btnToday = document.getElementById("btn-cal-today");
  const dateInput = document.getElementById("calendar-date-input");
  const dateBox = document.getElementById("cal-date-display-box");
  const btnViewDaily = document.getElementById("btn-view-daily");
  const btnViewWeekly = document.getElementById("btn-view-weekly");
  const techFilter = document.getElementById("calendar-tech-filter");
  const btnNewApp = document.getElementById("btn-new-appointment");
  const btnToggleSidebar = document.getElementById("btn-toggle-pending-sidebar");

  if (dateBox && dateInput) {
    dateBox.addEventListener("click", () => {
      if (typeof dateInput.showPicker === "function") {
        dateInput.showPicker();
      } else {
        dateInput.focus();
      }
    });
  }

  if (dateInput) {
    dateInput.addEventListener("change", (e) => {
      if (e.target.value) {
        calendarState.selectedDate = e.target.value;
        renderCalendar();
      }
    });
  }

  if (btnToday) {
    btnToday.addEventListener("click", () => {
      calendarState.selectedDate = getLocalDateString(new Date());
      renderCalendar();
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      const [year, month, day] = calendarState.selectedDate.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      const step = calendarState.currentView === "weekly" ? 7 : 1;
      d.setDate(d.getDate() - step);
      calendarState.selectedDate = getLocalDateString(d);
      renderCalendar();
    });
  }

  if (btnNext) {
    btnNext.addEventListener("click", () => {
      const [year, month, day] = calendarState.selectedDate.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      const step = calendarState.currentView === "weekly" ? 7 : 1;
      d.setDate(d.getDate() + step);
      calendarState.selectedDate = getLocalDateString(d);
      renderCalendar();
    });
  }

  if (btnViewDaily) {
    btnViewDaily.addEventListener("click", () => {
      calendarState.currentView = "daily";
      renderCalendar();
    });
  }

  if (btnViewWeekly) {
    btnViewWeekly.addEventListener("click", () => {
      calendarState.currentView = "weekly";
      renderCalendar();
    });
  }

  if (techFilter) {
    techFilter.addEventListener("change", (e) => {
      calendarState.selectedTechnician = e.target.value;
      renderCalendar();
    });
  }

  if (btnNewApp) {
    btnNewApp.addEventListener("click", () => {
      openNewAppointmentModal({
        scheduledDate: calendarState.selectedDate,
        startTime: "08:00"
      });
    });
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener("click", () => {
      const sidebar = document.getElementById("calendar-pending-sidebar");
      if (sidebar) {
        sidebar.classList.toggle("collapsed");
        const isCollapsed = sidebar.classList.contains("collapsed");
        btnToggleSidebar.innerHTML = isCollapsed
          ? `<i data-lucide="chevrons-right"></i>`
          : `<i data-lucide="chevrons-left"></i>`;
        lucide.createIcons();
      }
    });
  }
}

function setupAppointmentModals() {
  const modal = document.getElementById("appointment-modal");
  const form = document.getElementById("appointment-form");
  const startTimeSelect = document.getElementById("app-start-time");

  if (startTimeSelect) {
    startTimeSelect.innerHTML = "";
    for (let hour = 8; hour < 18; hour++) {
      for (const minute of ["00", "30"]) {
        const timeVal = `${String(hour).padStart(2, "0")}:${minute}`;
        startTimeSelect.innerHTML += `<option value="${timeVal}">${timeVal}</option>`;
      }
    }
  }

  const radioPart = document.getElementById("source-part");
  const radioOrder = document.getElementById("source-order");
  const labelPart = document.getElementById("label-source-part");
  const labelOrder = document.getElementById("label-source-order");
  const partGroup = document.getElementById("app-part-group");

  const syncSourceType = () => {
    if (radioPart && radioPart.checked) {
      if (labelPart) labelPart.classList.add("active");
      if (labelOrder) labelOrder.classList.remove("active");
      if (partGroup) partGroup.style.display = "block";
    } else {
      if (labelPart) labelPart.classList.remove("active");
      if (labelOrder) labelOrder.classList.add("active");
      if (partGroup) partGroup.style.display = "none";
    }
  };

  if (radioPart) radioPart.addEventListener("change", syncSourceType);
  if (radioOrder) radioOrder.addEventListener("change", syncSourceType);

  const requestSelect = document.getElementById("app-request-select");
  if (requestSelect) {
    requestSelect.addEventListener("change", () => {
      const reqId = requestSelect.value;
      if (!reqId) return;
      const req = state.requests.find(r => r.id === reqId);
      if (req) {
        document.getElementById("app-client-name").value = req.requester || "";
        document.getElementById("app-order-id").value = req.orderId || "";
        document.getElementById("app-device-model").value = req.deviceModel || "";
        document.getElementById("app-device-model-code").value = req.deviceModelCode || "";
        document.getElementById("app-imei").value = req.imei || "";
        document.getElementById("app-part-name").value = req.partName || "";
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const alertBox = document.getElementById("app-conflict-alert");
      const alertMsg = document.getElementById("app-conflict-message");
      if (alertBox) alertBox.style.display = "none";

      const editingId = document.getElementById("app-id").value;
      const isPartSource = document.getElementById("source-part")?.checked;
      const requestId = isPartSource ? document.getElementById("app-request-select").value : null;

      const clientName = document.getElementById("app-client-name").value.trim();
      const orderId = document.getElementById("app-order-id").value.trim();
      const deviceModel = document.getElementById("app-device-model").value.trim();
      const deviceModelCode = document.getElementById("app-device-model-code").value.trim();
      const imei = document.getElementById("app-imei").value.trim();
      const partName = document.getElementById("app-part-name").value.trim();
      const technician = document.getElementById("app-technician").value;
      const scheduledDate = document.getElementById("app-scheduled-date").value;
      const startTime = document.getElementById("app-start-time").value;
      const durationMinutes = Number(document.getElementById("app-duration").value) || 60;
      const endTime = calculateEndTime(startTime, durationMinutes);
      const notes = document.getElementById("app-notes").value.trim();

      const payload = {
        requestId: requestId || undefined,
        orderId,
        clientName,
        deviceModel,
        deviceModelCode,
        imei,
        partName,
        technician,
        scheduledDate,
        startTime,
        endTime,
        durationMinutes,
        notes
      };

      const conflict = checkAppointmentConflict(payload, editingId || null);
      if (conflict) {
        if (alertBox && alertMsg) {
          alertMsg.textContent = `Conflito de agenda: o técnico ${technician} já possui o agendamento de "${conflict.clientName}" (${conflict.startTime} às ${conflict.endTime}) nesse horário.`;
          alertBox.style.display = "flex";
        }
        return;
      }

      try {
        if (editingId) {
          const res = await api.updateAppointment(editingId, payload);
          const updated = res.appointment;
          const idx = state.appointments.findIndex(a => a.id === editingId);
          if (idx !== -1) state.appointments[idx] = updated;
          showToast("Agendamento atualizado com sucesso!");
        } else {
          const res = await api.createAppointment(payload);
          const created = res.appointment;
          state.appointments.push(created);
          showToast("Reparo agendado com sucesso na bancada!");
        }

        modal.classList.remove("active");
        renderCalendar();
        renderPendingArrivedParts();
        updateDashboard();
      } catch (err) {
        console.error(err);
        if (alertBox && alertMsg) {
          alertMsg.textContent = err.message || "Erro ao salvar agendamento.";
          alertBox.style.display = "flex";
        } else {
          showToast(err.message || "Erro ao salvar agendamento.", "error");
        }
      }
    });
  }
}

function openNewAppointmentModal(defaults = {}) {
  const modal = document.getElementById("appointment-modal");
  if (!modal) return;

  document.getElementById("appointment-modal-title").textContent = "Novo Agendamento de Reparo";
  document.getElementById("app-id").value = "";
  document.getElementById("appointment-form").reset();

  const alertBox = document.getElementById("app-conflict-alert");
  if (alertBox) alertBox.style.display = "none";

  const techSelect = document.getElementById("app-technician");
  if (techSelect) {
    const techs = Array.isArray(state.settings.technicians) && state.settings.technicians.length > 0
      ? state.settings.technicians
      : ["Técnico 1", "Técnico 2"];
    techSelect.innerHTML = techs.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
    if (defaults.technician && techs.includes(defaults.technician)) {
      techSelect.value = defaults.technician;
    }
  }

  const reqSelect = document.getElementById("app-request-select");
  if (reqSelect) {
    const delivered = state.requests.filter(r => r.status === "Entregue");
    const unscheduled = delivered.filter(r => {
      return !state.appointments.some(a => a.requestId === r.id && a.status !== "Cancelado");
    });

    reqSelect.innerHTML = `<option value="">-- Selecione uma peça entregue --</option>` +
      unscheduled.map(r => `
        <option value="${escapeHtml(r.id)}">${escapeHtml(r.requester)} - ${escapeHtml(r.deviceModel)} (${escapeHtml(r.partName)})</option>
      `).join("");
  }

  const dateInput = document.getElementById("app-scheduled-date");
  if (dateInput) {
    dateInput.value = defaults.scheduledDate || calendarState.selectedDate || getLocalDateString(new Date());
  }

  const timeSelect = document.getElementById("app-start-time");
  if (timeSelect && defaults.startTime) {
    timeSelect.value = defaults.startTime;
  }

  if (defaults.requestId) {
    document.getElementById("source-part").checked = true;
    document.getElementById("label-source-part").classList.add("active");
    document.getElementById("label-source-order").classList.remove("active");
    document.getElementById("app-part-group").style.display = "block";

    if (reqSelect) {
      reqSelect.value = defaults.requestId;
      const req = state.requests.find(r => r.id === defaults.requestId);
      if (req) {
        document.getElementById("app-client-name").value = req.requester || "";
        document.getElementById("app-order-id").value = req.orderId || "";
        document.getElementById("app-device-model").value = req.deviceModel || "";
        document.getElementById("app-device-model-code").value = req.deviceModelCode || "";
        document.getElementById("app-imei").value = req.imei || "";
        document.getElementById("app-part-name").value = req.partName || "";
      }
    }
  } else {
    document.getElementById("source-part").checked = true;
    document.getElementById("label-source-part").classList.add("active");
    document.getElementById("label-source-order").classList.remove("active");
    document.getElementById("app-part-group").style.display = "block";
  }

  modal.classList.add("active");
  lucide.createIcons();
}

function openAppointmentDetailsModal(app) {
  const modal = document.getElementById("appointment-details-modal");
  if (!modal) return;

  document.getElementById("detail-app-id").value = app.id;

  const originTag = document.getElementById("detail-app-origin");
  if (originTag) {
    if (app.requestId) {
      originTag.innerHTML = `<i data-lucide="package"></i> Peça PartSync`;
      originTag.style.color = "var(--primary)";
    } else {
      originTag.innerHTML = `<i data-lucide="clipboard-list"></i> O.S. Externa`;
      originTag.style.color = "var(--secondary)";
    }
  }

  const orderTag = document.getElementById("detail-app-order");
  if (orderTag) {
    orderTag.textContent = app.orderId ? `O.S. #${app.orderId}` : "Sem Nº de O.S.";
  }

  const statusBadge = document.getElementById("detail-app-status-badge");
  if (statusBadge) {
    const statusSlug = getAppointmentStatusSlug(app.status);
    statusBadge.className = `badge-status badge-${statusSlug}`;
    statusBadge.textContent = app.status;
  }

  document.getElementById("detail-app-client").textContent = app.clientName || "-";
  document.getElementById("detail-app-technician").textContent = app.technician || "-";
  document.getElementById("detail-app-device").textContent = app.deviceModel || "-";

  const codeImei = [
    app.deviceModelCode ? `Mod: ${app.deviceModelCode}` : "",
    app.imei ? `IMEI: ${app.imei}` : ""
  ].filter(Boolean).join(" | ") || "-";
  document.getElementById("detail-app-code-imei").textContent = codeImei;

  document.getElementById("detail-app-part").textContent = app.partName || "-";

  const datePt = formatDateDisplayPt(app.scheduledDate);
  document.getElementById("detail-app-datetime").textContent = `${datePt} - ${app.startTime} às ${app.endTime} (${app.durationMinutes} min)`;

  const notesEl = document.getElementById("detail-app-notes");
  if (notesEl) {
    notesEl.textContent = app.notes || "Nenhuma observação informada.";
  }

  modal.querySelectorAll(".btn-status-action").forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    const targetStatus = newBtn.getAttribute("data-status");
    newBtn.addEventListener("click", async () => {
      try {
        const res = await api.updateAppointment(app.id, { status: targetStatus });
        const updated = res.appointment;
        const idx = state.appointments.findIndex(a => a.id === app.id);
        if (idx !== -1) state.appointments[idx] = updated;

        showToast(`Status do reparo alterado para "${targetStatus}"!`);
        modal.classList.remove("active");
        renderCalendar();
        renderPendingArrivedParts();
        updateDashboard();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Erro ao atualizar status.", "error");
      }
    });
  });

  const deleteBtn = document.getElementById("btn-delete-appointment");
  if (deleteBtn) {
    const newDeleteBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

    newDeleteBtn.addEventListener("click", async () => {
      if (confirm(`Tem certeza que deseja excluir o agendamento de "${app.clientName}"?`)) {
        try {
          await api.deleteAppointment(app.id);
          state.appointments = state.appointments.filter(a => a.id !== app.id);
          showToast("Agendamento excluído.", "info");
          modal.classList.remove("active");
          renderCalendar();
          renderPendingArrivedParts();
          updateDashboard();
        } catch (err) {
          console.error(err);
          showToast("Erro ao excluir agendamento.", "error");
        }
      }
    });
  }

  const copyBtn = document.getElementById("btn-copy-repair-slip");
  if (copyBtn) {
    const newCopyBtn = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

    newCopyBtn.addEventListener("click", () => {
      const slipText = generateRepairSlipText(app);
      navigator.clipboard.writeText(slipText)
        .then(() => showToast("Ficha do reparo copiada com sucesso!"))
        .catch(() => showToast("Erro ao copiar ficha.", "error"));
    });
  }

  const rescheduleBtn = document.getElementById("btn-reschedule-appointment");
  if (rescheduleBtn) {
    const newRescheduleBtn = rescheduleBtn.cloneNode(true);
    rescheduleBtn.parentNode.replaceChild(newRescheduleBtn, rescheduleBtn);

    newRescheduleBtn.addEventListener("click", () => {
      modal.classList.remove("active");
      openEditAppointmentModal(app);
    });
  }

  modal.classList.add("active");
  lucide.createIcons();
}

function generateRepairSlipText(app) {
  const datePt = formatDateDisplayPt(app.scheduledDate);
  return `📋 FICHA DE AGENDAMENTO DE REPARO - PARTSYNC
------------------------------------------------
Cliente: ${app.clientName}
Aparelho: ${app.deviceModel}${app.deviceModelCode ? ` (${app.deviceModelCode})` : ""}
IMEI: ${app.imei || "Não informado"}
${app.orderId ? `Ordem de Serviço: ${app.orderId}\n` : ""}Peça: ${app.partName}
Técnico Designado: ${app.technician}
Agendamento: ${datePt}
Horário: ${app.startTime} às ${app.endTime} (${app.durationMinutes} min)
Status: ${app.status}
Observações: ${app.notes || "Sem observações"}
------------------------------------------------`;
}

function openEditAppointmentModal(app) {
  openNewAppointmentModal({
    scheduledDate: app.scheduledDate,
    startTime: app.startTime,
    technician: app.technician
  });

  document.getElementById("appointment-modal-title").textContent = "Reagendar / Editar Reparo";
  document.getElementById("app-id").value = app.id;

  if (app.requestId) {
    document.getElementById("source-part").checked = true;
    document.getElementById("label-source-part").classList.add("active");
    document.getElementById("label-source-order").classList.remove("active");
    document.getElementById("app-part-group").style.display = "block";
    const reqSelect = document.getElementById("app-request-select");
    if (reqSelect) reqSelect.value = app.requestId;
  } else {
    document.getElementById("source-order").checked = true;
    document.getElementById("label-source-order").classList.add("active");
    document.getElementById("label-source-part").classList.remove("active");
    document.getElementById("app-part-group").style.display = "none";
  }

  document.getElementById("app-client-name").value = app.clientName || "";
  document.getElementById("app-order-id").value = app.orderId || "";
  document.getElementById("app-device-model").value = app.deviceModel || "";
  document.getElementById("app-device-model-code").value = app.deviceModelCode || "";
  document.getElementById("app-imei").value = app.imei || "";
  document.getElementById("app-part-name").value = app.partName || "";
  document.getElementById("app-technician").value = app.technician || "";
  document.getElementById("app-scheduled-date").value = app.scheduledDate || "";
  document.getElementById("app-start-time").value = app.startTime || "08:00";
  document.getElementById("app-duration").value = String(app.durationMinutes || 60);
  document.getElementById("app-notes").value = app.notes || "";
}

