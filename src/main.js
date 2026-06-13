// PartSync - Application Logic (Non-WhatsApp Version)

// Autocomplete Dictionaries
const DEVICEMODELS_DB = [
  "Samsung Galaxy S24 Ultra",
  "Samsung Galaxy S24+",
  "Samsung Galaxy S24",
  "Samsung Galaxy S23 Ultra",
  "Samsung Galaxy S23+",
  "Samsung Galaxy S23",
  "Samsung Galaxy S23 FE",
  "Samsung Galaxy S22 Ultra",
  "Samsung Galaxy S22+",
  "Samsung Galaxy S22",
  "Samsung Galaxy S21 Ultra",
  "Samsung Galaxy S21+",
  "Samsung Galaxy S21",
  "Samsung Galaxy S21 FE",
  "Samsung Galaxy S20 Ultra",
  "Samsung Galaxy S20+",
  "Samsung Galaxy S20",
  "Samsung Galaxy S20 FE",
  "Samsung Galaxy A55 5G",
  "Samsung Galaxy A54 5G",
  "Samsung Galaxy A35 5G",
  "Samsung Galaxy A34 5G",
  "Samsung Galaxy A25 5G",
  "Samsung Galaxy A15 5G",
  "Samsung Galaxy A14 5G",
  "Samsung Galaxy M54 5G",
  "Samsung Galaxy M34 5G",
  "Samsung Galaxy Note 20 Ultra",
  "Samsung Galaxy Note 20",
  "Samsung Galaxy Z Fold 5",
  "Samsung Galaxy Z Flip 5",
  "Samsung Galaxy Z Fold 6",
  "Samsung Galaxy Z Flip 6"
];

const PARTS_DB = [
  "Tela Frontal Dynamic AMOLED (Original)",
  "Tela Frontal Super AMOLED (Original)",
  "Bateria Original de Fábrica",
  "Conector de Carga / Flex Principal (Original)",
  "Sub-Placa de Conector de Carga (Original)",
  "Tampa Traseira de Vidro (Original)",
  "Câmera Traseira Principal (Original)",
  "Câmera Frontal (Original)",
  "Flex de Botão Power e Biometria (Original)",
  "Flex de Botões de Volume (Original)",
  "Alto-Falante Auricular (Original)",
  "Alto-Falante Campainha (Original)",
  "Lente de Vidro da Câmera (Original)",
  "Aro Lateral / Chassi (Original)",
  "Gaveta de Chip SIM (Original)",
  "Conector FPC de Bateria / Tela (Original)",
  "CI de Carga / Regulador de Energia (Original)"
];

// App State
let state = {
  requests: [],
  settings: {
    defaultRequester: ""
  }
};

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  setupRouter();
  setupFormEventListeners();
  setupAutocomplete();
  setupHistoryFilters();
  setupSettingsEventListeners();
  setupModals();
  updateDashboard();
  
  // Fill default requester on new request form if exists
  if (state.settings.defaultRequester) {
    document.getElementById("requester-name").value = state.settings.defaultRequester;
    document.getElementById("display-user-name").textContent = state.settings.defaultRequester;
  } else {
    document.getElementById("display-user-name").textContent = "Técnico Convidado";
  }

  // Initialize Lucide Icons
  lucide.createIcons();

  // Trigger initial live summary update
  updateSummaryPreview();
});

// Load data from LocalStorage
function loadData() {
  const localRequests = localStorage.getItem("partsync_requests");
  const localSettings = localStorage.getItem("partsync_settings");

  if (localRequests) {
    state.requests = JSON.parse(localRequests);
  } else {
    state.requests = [];
  }

  if (localSettings) {
    state.settings = { ...state.settings, ...JSON.parse(localSettings) };
  }
}

// Save requests to LocalStorage
function saveRequests() {
  localStorage.setItem("partsync_requests", JSON.stringify(state.requests));
  updateDashboard();
  renderHistoryTable();
}

// Router & Section Toggling
function setupRouter() {
  const navItems = document.querySelectorAll(".nav-item, .mobile-nav-item, .view-all-link, .btn-new-req-shortcut");
  
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
      const target = item.getAttribute("data-target") || item.getAttribute("href").replace("#", "");
      let resolvedTarget = target;
      if (target === "nova-solicitacao") resolvedTarget = "new-request";
      if (target === "historico") resolvedTarget = "history";
      if (target === "configuracoes") resolvedTarget = "settings";

      if (document.getElementById(resolvedTarget)) {
        e.preventDefault();
        navigateToSection(resolvedTarget);
        window.location.hash = resolvedTarget;
      }
    });
  });

  // Shortcut triggers
  document.querySelectorAll(".btn-new-req-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      navigateToSection("new-request");
    });
  });

  // Mobile Top Header Settings Button
  const mobileSettingsBtn = document.getElementById("mobile-settings-btn");
  if (mobileSettingsBtn) {
    mobileSettingsBtn.addEventListener("click", () => {
      navigateToSection("settings");
    });
  }

  // Handle URL hash on load
  if (window.location.hash) {
    const hash = window.location.hash.replace("#", "");
    if (document.getElementById(hash)) {
      navigateToSection(hash);
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
  return `FICHA DE SOLICITAÇÃO - PARTSYNC
----------------------------------
Data/Hora: ${data.date}
Solicitante: ${data.requester}
Aparelho: ${data.deviceModel}
Peça: ${data.partName}
Quantidade: ${data.quantity}x
Urgência: ${data.urgency}
----------------------------------
Observações: ${data.notes || "Nenhuma."}`;
}

// Live update of the Ficha Técnica summary panel
function updateSummaryPreview() {
  const requester = document.getElementById("requester-name").value || "-";
  const deviceModel = document.getElementById("device-model").value || "-";
  const partName = document.getElementById("part-name").value || "-";
  const quantity = document.getElementById("part-quantity").value || "1";
  
  const urgencyActive = document.querySelector('input[name="urgency"]:checked');
  const urgency = urgencyActive ? urgencyActive.value : "Baixa";
  
  const notes = document.getElementById("request-notes").value || "";
  
  // Update HTML elements in the summary card
  document.getElementById("sum-requester").textContent = requester;
  document.getElementById("sum-device").textContent = deviceModel;
  document.getElementById("sum-part").textContent = partName;
  document.getElementById("sum-quantity").textContent = quantity + "x";
  document.getElementById("sum-urgency").textContent = urgency;
  
  const notesDisplay = document.getElementById("sum-notes");
  if (notesDisplay) {
    notesDisplay.textContent = notes ? notes : "Nenhuma observação informada.";
  }
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

  btnReset.addEventListener("click", () => {
    form.reset();
    if (state.settings.defaultRequester) {
      document.getElementById("requester-name").value = state.settings.defaultRequester;
    }
    updateSummaryPreview();
    showToast("Formulário limpo", "info");
  });

  btnCopySummary.addEventListener("click", () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const requester = document.getElementById("requester-name").value || "Técnico";
    const deviceModel = document.getElementById("device-model").value || "Não especificado";
    const partName = document.getElementById("part-name").value || "Não especificado";
    const quantity = document.getElementById("part-quantity").value || "1";
    
    const urgencyActive = document.querySelector('input[name="urgency"]:checked');
    const urgency = urgencyActive ? urgencyActive.value : "Baixa";
    
    const notes = document.getElementById("request-notes").value || "";

    const textToCopy = generateSummaryText({
      date: dateStr,
      requester,
      deviceModel,
      partName,
      quantity,
      urgency,
      notes
    });

    navigator.clipboard.writeText(textToCopy)
      .then(() => showToast("Ficha técnica copiada para a área de transferência!"))
      .catch(() => showToast("Erro ao copiar ficha técnica.", "error"));
  });

  // Submit Handler
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (validateForm()) {
      saveRequestFromForm();
    }
  });
}

function validateForm() {
  const requester = document.getElementById("requester-name").value.trim();
  const deviceModel = document.getElementById("device-model").value.trim();
  const partName = document.getElementById("part-name").value.trim();
  const quantity = document.getElementById("part-quantity").value;

  if (!requester) {
    showToast("Nome do solicitante é obrigatório", "error");
    return false;
  }
  if (!deviceModel) {
    showToast("Modelo do dispositivo é obrigatório", "error");
    return false;
  }
  
  // Enforce Samsung brand
  const deviceLower = deviceModel.toLowerCase();
  const isSamsung = deviceLower.includes("samsung") || 
                    deviceLower.includes("galaxy") || 
                    DEVICEMODELS_DB.some(m => m.toLowerCase().includes(deviceLower));

  if (!isSamsung) {
    showToast("Apenas dispositivos da marca Samsung são aceitos.", "error");
    return false;
  }

  if (!partName) {
    showToast("Nome da peça é obrigatório", "error");
    return false;
  }
  if (!quantity || quantity < 1) {
    showToast("Insira uma quantidade válida superior a 0", "error");
    return false;
  }
  return true;
}

function saveRequestFromForm() {
  const requester = document.getElementById("requester-name").value.trim();
  const deviceModel = document.getElementById("device-model").value.trim();
  const partName = document.getElementById("part-name").value.trim();
  const quantity = parseInt(document.getElementById("part-quantity").value);
  
  const urgencyActive = document.querySelector('input[name="urgency"]:checked');
  const urgency = urgencyActive ? urgencyActive.value : "Baixa";
  
  const notes = document.getElementById("request-notes").value.trim();
  
  const now = new Date();
  
  const newRequest = {
    id: "req_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    createdAt: now.toISOString(),
    requester,
    deviceModel,
    partName,
    quantity,
    urgency,
    notes,
    status: "Pendente",
    logs: [
      {
        timestamp: now.toISOString(),
        status: "Pendente",
        notes: "Solicitação registrada no sistema"
      }
    ]
  };

  state.requests.unshift(newRequest);
  saveRequests();

  showToast(`Solicitação de "${partName}" salva com sucesso!`);

  // Clear inputs (except Requester Name)
  document.getElementById("device-model").value = "";
  document.getElementById("part-name").value = "";
  document.getElementById("part-quantity").value = 1;
  document.getElementById("urgency-low").checked = true;
  document.getElementById("request-notes").value = "";

  updateSummaryPreview();

  return newRequest;
}

// Autocomplete logic
function setupAutocomplete() {
  function autocomplete(inp, arr, listId) {
    let currentFocus;
    
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
        return;
      }
      
      a.style.display = "block";
      
      filtered.slice(0, 8).forEach(item => {
        b = document.createElement("DIV");
        
        // Bold the matching substring
        const matchIdx = item.toLowerCase().indexOf(val.toLowerCase());
        const start = item.substr(0, matchIdx);
        const match = item.substr(matchIdx, val.length);
        const end = item.substr(matchIdx + val.length);
        
        b.innerHTML = `${start}<strong>${match}</strong>${end}`;
        b.innerHTML += `<input type='hidden' value='${item.replace("'", "&#39;")}'>`;
        
        b.addEventListener("click", function(e) {
          inp.value = this.getElementsByTagName("input")[0].value;
          closeAllLists();
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
      if (e.keyCode == 40) { // down arrow
        currentFocus++;
        addActive(x);
      } else if (e.keyCode == 38) { // up arrow
        currentFocus--;
        addActive(x);
      } else if (e.keyCode == 13) { // enter
        if (currentFocus > -1) {
          e.preventDefault();
          if (x) x[currentFocus].click();
        }
      }
    });
    
    function addActive(x) {
      if (!x) return false;
      removeActive(x);
      if (currentFocus >= x.length) currentFocus = 0;
      if (currentFocus < 0) currentFocus = (x.length - 1);
      x[currentFocus].classList.add("autocomplete-active");
      
      x[currentFocus].scrollIntoView({ block: "nearest" });
    }
    
    function removeActive(x) {
      for (let i = 0; i < x.length; i++) {
        x[i].classList.remove("autocomplete-active");
      }
    }
    
    function closeAllLists(elmnt) {
      const x = document.getElementById(listId);
      if (x) {
        x.innerHTML = "";
        x.style.display = "none";
      }
    }
    
    // Close when clicking elsewhere
    document.addEventListener("click", function (e) {
      if (e.target != inp) {
        closeAllLists();
      }
    });
  }

  autocomplete(document.getElementById("device-model"), DEVICEMODELS_DB, "device-autocomplete-list");
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

  const pctPendingEl = document.getElementById("pct-pending");
  if (pctPendingEl) {
    const pct = total > 0 ? Math.round((pending / total) * 100) : 0;
    pctPendingEl.textContent = pct;
  }

  // Populate Dashboard Table (Last 5 items)
  const recentTbody = document.getElementById("recent-requests-tbody");
  if (!recentTbody) return;

  const recentRequests = state.requests.slice(0, 5);

  if (recentRequests.length === 0) {
    recentTbody.innerHTML = `
      <tr class="empty-row-placeholder">
        <td colspan="7" class="text-center">
          <div class="empty-state">
            <i data-lucide="clipboard-list"></i>
            <p>Nenhuma solicitação cadastrada.</p>
            <button class="btn btn-secondary btn-sm btn-new-req-shortcut" style="margin-top: 10px;">Solicitar Primeira Peça</button>
          </div>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  recentTbody.innerHTML = "";
  
  recentRequests.forEach(req => {
    const dateObj = new Date(req.createdAt);
    const dateFormatted = dateObj.toLocaleDateString("pt-BR") + " " + dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const statusClass = req.status.toLowerCase();
    const urgencyClass = req.urgency.toLowerCase() === "baixa" ? "low" : req.urgency.toLowerCase() === "média" ? "medium" : "high";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dateFormatted}</td>
      <td style="font-weight: 600;">${req.deviceModel}</td>
      <td>${req.partName}</td>
      <td>${req.quantity}</td>
      <td>
        <span class="urgency-badge">
          <span class="urgency-dot ${urgencyClass}"></span>
          <span>${req.urgency}</span>
        </span>
      </td>
      <td><span class="badge ${statusClass}">${req.status}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-secondary btn-icon-only btn-status-shortcut" data-id="${req.id}" title="Alterar Status">
            <i data-lucide="edit-3"></i>
          </button>
        </div>
      </td>
    `;
    recentTbody.appendChild(tr);
  });

  // Setup table action button
  recentTbody.querySelectorAll(".btn-status-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      openStatusModal(btn.getAttribute("data-id"));
    });
  });

  lucide.createIcons();
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
      req.partName.toLowerCase().includes(searchQuery) ||
      req.requester.toLowerCase().includes(searchQuery) ||
      (req.notes && req.notes.toLowerCase().includes(searchQuery));

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

function renderHistoryTable() {
  const tbody = document.getElementById("history-tbody");
  if (!tbody) return;

  // Filter requests
  const filtered = getFilteredRequests();

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center">
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

  filtered.forEach(req => {
    const dateObj = new Date(req.createdAt);
    const dateFormatted = dateObj.toLocaleDateString("pt-BR") + " " + dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const statusClass = req.status.toLowerCase();
    const urgencyClass = req.urgency.toLowerCase() === "baixa" ? "low" : req.urgency.toLowerCase() === "média" ? "medium" : "high";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dateFormatted}</td>
      <td>${req.requester}</td>
      <td style="font-weight: 600;">${req.deviceModel}</td>
      <td>${req.partName}</td>
      <td>${req.quantity}</td>
      <td>
        <span class="urgency-badge">
          <span class="urgency-dot ${urgencyClass}"></span>
          <span>${req.urgency}</span>
        </span>
      </td>
      <td><span class="badge ${statusClass}">${req.status}</span></td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-secondary btn-icon-only btn-status-shortcut" data-id="${req.id}" title="Alterar Status">
            <i data-lucide="edit-3"></i>
          </button>
          <button class="btn btn-secondary btn-icon-only btn-copy-shortcut" data-id="${req.id}" title="Copiar Ficha Técnica">
            <i data-lucide="copy"></i>
          </button>
          <button class="btn btn-danger btn-icon-only btn-delete-shortcut" data-id="${req.id}" title="Excluir">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Hook actions
  tbody.querySelectorAll(".btn-status-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      openStatusModal(btn.getAttribute("data-id"));
    });
  });

  tbody.querySelectorAll(".btn-copy-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      const req = state.requests.find(r => r.id === btn.getAttribute("data-id"));
      if (req) {
        const formattedDate = new Date(req.createdAt).toLocaleDateString("pt-BR") + " " + 
                              new Date(req.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const text = generateSummaryText({ ...req, date: formattedDate });
        navigator.clipboard.writeText(text)
          .then(() => showToast("Ficha técnica copiada!"))
          .catch(() => showToast("Erro ao copiar.", "error"));
      }
    });
  });

  tbody.querySelectorAll(".btn-delete-shortcut").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteRequest(btn.getAttribute("data-id"));
    });
  });

  lucide.createIcons();
}

function deleteRequest(id) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;

  if (confirm(`Tem certeza que deseja excluir o registro de "${req.partName}" para "${req.deviceModel}"?`)) {
    state.requests = state.requests.filter(r => r.id !== id);
    saveRequests();
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
  
  document.getElementById("modal-req-summary").innerHTML = `
    <strong>Dispositivo:</strong> ${req.deviceModel} <br>
    <strong>Peça:</strong> ${req.partName} (Qtd: ${req.quantity}) <br>
    <strong>Solicitado por:</strong> ${req.requester} em ${createdDate} <br>
    <strong>Status Atual:</strong> ${req.status}
  `;

  document.getElementById("modal-status-select").value = req.status;
  document.getElementById("modal-notes-append").value = "";

  modal.classList.add("active");

  // Hook submit status button (remove old event listener)
  const saveBtn = document.getElementById("btn-save-status-change");
  const newSaveBtn = saveBtn.cloneNode(true);
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

  newSaveBtn.addEventListener("click", () => {
    saveStatusChange(id);
  });
}

function saveStatusChange(id) {
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
  
  saveRequests();
  
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
    saveBulkStatusChange();
  });
}

function saveBulkStatusChange() {
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

  saveRequests();
  showToast(`${selectedIds.length} solicitações atualizadas para "${newStatus}"!`);
  
  // Close modal
  document.getElementById("bulk-status-modal").classList.remove("active");
  renderHistoryTable();
}

// Settings Panel Logic
function setupSettingsEventListeners() {
  const settingsForm = document.getElementById("settings-form");
  const nameInp = document.getElementById("setting-default-requester");

  // Pre-fill fields
  if (state.settings.defaultRequester) {
    nameInp.value = state.settings.defaultRequester;
  }

  // Save Settings
  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    
    state.settings.defaultRequester = nameInp.value.trim();
    localStorage.setItem("partsync_settings", JSON.stringify(state.settings));
    
    if (state.settings.defaultRequester) {
      document.getElementById("requester-name").value = state.settings.defaultRequester;
      document.getElementById("display-user-name").textContent = state.settings.defaultRequester;
    } else {
      document.getElementById("display-user-name").textContent = "Técnico Convidado";
    }

    showToast("Preferências salvas com sucesso!");
    updateSummaryPreview();
  });

  // Backup: Export CSV
  document.getElementById("btn-export-data").addEventListener("click", () => {
    downloadCSV(state.requests, "partsync_solicitacoes_backup");
  });

  // Redefine / Clear App
  document.getElementById("btn-reset-app").addEventListener("click", () => {
    if (confirm("ATENÇÃO: Isso irá APAGAR TODO o seu histórico e preferências do PartSync permanentemente. Continuar?")) {
      if (confirm("Confirmação final: Deseja mesmo deletar todos os dados?")) {
        localStorage.clear();
        state.requests = [];
        state.settings = {
          defaultRequester: ""
        };
        
        nameInp.value = "";
        document.getElementById("requester-name").value = "";
        document.getElementById("display-user-name").textContent = "Técnico Convidado";
        
        saveRequests();
        showToast("Aplicativo redefinido para o estado original.", "info");
        
        setTimeout(() => {
          window.location.hash = "dashboard";
          window.location.reload();
        }, 1000);
      }
    }
  });
}

// Reusable function to export requests to CSV
function downloadCSV(requests, filenamePrefix = "partsync_solicitacoes") {
  if (requests.length === 0) {
    showToast("Não há solicitações registradas para exportar.", "warning");
    return;
  }

  // CSV Headers
  const headers = ["ID", "Data/Hora", "Solicitante", "Aparelho", "Peça", "Quantidade", "Urgência", "Status", "Observações"];
  
  // Convert to CSV lines
  const csvRows = [];
  csvRows.push(headers.join(";")); // Semicolon as separator (Excel friendly in Brazil)

  requests.forEach(req => {
    const dateObj = new Date(req.createdAt);
    const dateFormatted = dateObj.toLocaleDateString("pt-BR") + " " + dateObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    
    const notesClean = req.notes ? req.notes.replace(/\r?\n|\r/g, " ") : ""; // remove newlines to keep CSV row valid

    const values = [
      req.id,
      dateFormatted,
      req.requester,
      req.deviceModel,
      req.partName,
      req.quantity,
      req.urgency,
      req.status,
      notesClean
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
