const deductionRate = 0.05;
const gradeKeys = ["A", "B", "C"];

const elements = {
  priceDate: document.getElementById("priceDate"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  varietyForm: document.getElementById("varietyForm"),
  varietyName: document.getElementById("varietyName"),
  varietyWeight: document.getElementById("varietyWeight"),
  varietyTable: document.getElementById("varietyTable"),
  priceTable: document.getElementById("priceTable"),
  farmerForm: document.getElementById("farmerForm"),
  farmerListName: document.getElementById("farmerListName"),
  farmerVillage: document.getElementById("farmerVillage"),
  farmerListPhone: document.getElementById("farmerListPhone"),
  farmerNotes: document.getElementById("farmerNotes"),
  farmerTable: document.getElementById("farmerTable"),
  farmerSelect: document.getElementById("farmerSelect"),
  lineItems: document.getElementById("lineItems"),
  addLineBtn: document.getElementById("addLineBtn"),
  receiptForm: document.getElementById("receiptForm"),
  farmerName: document.getElementById("farmerName"),
  farmerPhone: document.getElementById("farmerPhone"),
  advancePaid: document.getElementById("advancePaid"),
  transportCharge: document.getElementById("transportCharge"),
  unloadingCharge: document.getElementById("unloadingCharge"),
  grossTotal: document.getElementById("grossTotal"),
  deductionTotal: document.getElementById("deductionTotal"),
  advanceTotal: document.getElementById("advanceTotal"),
  transportTotal: document.getElementById("transportTotal"),
  unloadingTotal: document.getElementById("unloadingTotal"),
  netTotal: document.getElementById("netTotal"),
  historyTable: document.getElementById("historyTable"),
  statVarieties: document.getElementById("statVarieties"),
  statReceipts: document.getElementById("statReceipts"),
  printReceipt: document.getElementById("printReceipt"),
  sharePdf: document.getElementById("sharePdf"),
  shareWhatsapp: document.getElementById("shareWhatsapp"),
  shareEmail: document.getElementById("shareEmail"),
  loginOverlay: document.getElementById("loginOverlay"),
  loginForm: document.getElementById("loginForm"),
  loginUser: document.getElementById("loginUser"),
  loginPin: document.getElementById("loginPin"),
  loginNote: document.getElementById("loginNote"),
  togglePinForm: document.getElementById("togglePinForm"),
  pinForm: document.getElementById("pinForm"),
  newPin: document.getElementById("newPin"),
  confirmPin: document.getElementById("confirmPin"),
  currentUser: document.getElementById("currentUser"),
  logoutBtn: document.getElementById("logoutBtn"),
  openPinSettings: document.getElementById("openPinSettings"),
  receiptPreviewTable: document.getElementById("receiptPreviewTable"),
  receiptDateText: document.getElementById("receiptDateText"),
  receiptFarmerText: document.getElementById("receiptFarmerText"),
  receiptGrossText: document.getElementById("receiptGrossText"),
  receiptDeductionText: document.getElementById("receiptDeductionText"),
  receiptAdvanceText: document.getElementById("receiptAdvanceText"),
  receiptTransportText: document.getElementById("receiptTransportText"),
  receiptUnloadingText: document.getElementById("receiptUnloadingText"),
  receiptNetText: document.getElementById("receiptNetText"),
};

const navButtons = Array.from(document.querySelectorAll(".nav-link"));
const views = Array.from(document.querySelectorAll(".view"));

const lineTemplate = document.getElementById("lineTemplate");

const defaultVarieties = [
  { name: "Banginapalli", avgWeight: 20 },
  { name: "Rasalu", avgWeight: 18 },
  { name: "Totapuri", avgWeight: 22 },
];

let storageMode = "local";
let state = {
  varieties: [],
  pricesByDate: {},
  receiptsByDate: {},
  farmers: [],
};

let currentUser = null;
const defaultAuth = { username: "admin", pin: "1234" };

function getTodayKey() {
  return elements.priceDate.value || new Date().toISOString().slice(0, 10);
}

function setActiveView(viewKey) {
  views.forEach((view) => {
    const isActive = view.dataset.view === viewKey;
    view.classList.toggle("active", isActive);
  });

  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewKey);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function ensureDate() {
  if (!elements.priceDate.value) {
    const today = new Date().toISOString().slice(0, 10);
    elements.priceDate.value = today;
  }
}

function loadLocalState() {
  const stored = localStorage.getItem("mangoDeskState");
  if (stored) {
    return JSON.parse(stored);
  }

  const priceMap = {};
  defaultVarieties.forEach((item) => {
    priceMap[item.name] = { A: 100, B: 80, C: 60 };
  });

  return {
    varieties: defaultVarieties,
    pricesByDate: {
      [getTodayKey()]: priceMap,
    },
    receiptsByDate: {},
    farmers: [],
  };
}

function saveLocalState() {
  localStorage.setItem("mangoDeskState", JSON.stringify(state));
}

function loadLocalAuth() {
  const stored = localStorage.getItem("mangoDeskAuth");
  if (stored) {
    return JSON.parse(stored);
  }
  localStorage.setItem("mangoDeskAuth", JSON.stringify(defaultAuth));
  return defaultAuth;
}

function saveLocalAuth(auth) {
  localStorage.setItem("mangoDeskAuth", JSON.stringify(auth));
}

async function detectBackend() {
  if (location.protocol === "file:") {
    return "local";
  }
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    if (res.ok) {
      return "api";
    }
  } catch (err) {
    return "local";
  }
  return "local";
}

async function apiGetJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("API request failed");
  }
  return res.json();
}

async function apiPostJson(path, payload) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("API request failed");
  }
  return res.json();
}

async function apiLogin(username, pin) {
  return apiPostJson("/api/login", { username, pin });
}

async function apiSetPin(username, pin) {
  return apiPostJson("/api/set-pin", { username, pin });
}

async function initStorage() {
  ensureDate();
  storageMode = await detectBackend();
  const dateKey = getTodayKey();

  if (storageMode === "local") {
    state = loadLocalState();
    if (!state.farmers) {
      state.farmers = [];
    }
    if (!state.pricesByDate[dateKey]) {
      state.pricesByDate[dateKey] = {};
    }
    return;
  }

  const varieties = await apiGetJson("/api/varieties");
  let finalVarieties = varieties;
  if (!finalVarieties.length) {
    for (const item of defaultVarieties) {
      await apiPostJson("/api/varieties", { name: item.name, avgWeight: item.avgWeight });
    }
    finalVarieties = defaultVarieties;
  }

  const prices = await apiGetJson(`/api/prices?date=${dateKey}`);
  const receipts = await apiGetJson(`/api/receipts?date=${dateKey}`);
  const farmers = await apiGetJson("/api/farmers");

  state = {
    varieties: finalVarieties,
    pricesByDate: {
      [dateKey]: Object.keys(prices).length ? prices : buildDefaultPrices(finalVarieties),
    },
    receiptsByDate: {
      [dateKey]: receipts,
    },
    farmers,
  };

  if (!Object.keys(prices).length) {
    await apiPostJson("/api/prices", { date: dateKey, prices: state.pricesByDate[dateKey] });
  }
}

function buildDefaultPrices(varieties) {
  const priceMap = {};
  varieties.forEach((item) => {
    priceMap[item.name] = { A: 100, B: 80, C: 60 };
  });
  return priceMap;
}

async function loadDateData(dateKey) {
  if (storageMode === "local") {
    if (!state.pricesByDate[dateKey]) {
      state.pricesByDate[dateKey] = buildDefaultPrices(state.varieties);
    }
    if (!state.receiptsByDate[dateKey]) {
      state.receiptsByDate[dateKey] = [];
    }
    saveLocalState();
    return;
  }

  const prices = await apiGetJson(`/api/prices?date=${dateKey}`);
  const receipts = await apiGetJson(`/api/receipts?date=${dateKey}`);
  state.pricesByDate[dateKey] = Object.keys(prices).length ? prices : buildDefaultPrices(state.varieties);
  state.receiptsByDate[dateKey] = receipts;

  if (!Object.keys(prices).length) {
    await apiPostJson("/api/prices", { date: dateKey, prices: state.pricesByDate[dateKey] });
  }
}

function formatRs(value) {
  return `Rs ${value.toFixed(0)}`;
}

function renderVarietyTable() {
  elements.varietyTable.innerHTML = state.varieties
    .map(
      (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.avgWeight}</td>
      </tr>
    `
    )
    .join("");
  elements.statVarieties.textContent = state.varieties.length.toString();
}

function renderPriceTable() {
  const dateKey = getTodayKey();
  const priceMap = state.pricesByDate[dateKey] || {};

  elements.priceTable.innerHTML = state.varieties
    .map((item) => {
      const prices = priceMap[item.name] || { A: 0, B: 0, C: 0 };
      return `
        <tr>
          <td>${item.name}</td>
          ${gradeKeys
            .map(
              (grade) => `
              <td>
                <input type="number" min="0" step="1" data-variety="${item.name}" data-grade="${grade}" value="${prices[grade] ?? 0}" />
              </td>
            `
            )
            .join("")}
        </tr>
      `;
    })
    .join("");
}

function renderFarmerTable() {
  if (!state.farmers.length) {
    elements.farmerTable.innerHTML = `
      <tr>
        <td colspan="4">No farmers added yet.</td>
      </tr>
    `;
    return;
  }

  elements.farmerTable.innerHTML = state.farmers
    .map(
      (farmer) => `
      <tr>
        <td>${farmer.name}</td>
        <td>${farmer.village || "-"}</td>
        <td>${farmer.phone || "-"}</td>
        <td><button class="btn ghost" type="button" data-farmer="${farmer.name}">Use</button></td>
      </tr>
    `
    )
    .join("");
}

function renderFarmerSelect() {
  if (!state.farmers.length) {
    elements.farmerSelect.innerHTML = "<option value=\"\">Manual entry</option>";
    return;
  }
  elements.farmerSelect.innerHTML = [
    "<option value=\"\">Manual entry</option>",
    ...state.farmers.map((farmer) => `<option value="${farmer.name}">${farmer.name}</option>`),
  ].join("");
}

function buildVarietyOptions(selected) {
  if (!state.varieties.length) {
    return "<option value=\"\">No varieties</option>";
  }
  return state.varieties
    .map(
      (item) =>
        `<option value="${item.name}" ${selected === item.name ? "selected" : ""}>${item.name}</option>`
    )
    .join("");
}

function getAvgWeight(variety) {
  const found = state.varieties.find((item) => item.name === variety);
  return found ? found.avgWeight : 0;
}

function getPrice(variety, grade) {
  const dateKey = getTodayKey();
  const priceMap = state.pricesByDate[dateKey] || {};
  const varietyPrices = priceMap[variety] || {};
  return Number(varietyPrices[grade] || 0);
}

function createLineItem(data) {
  const fragment = lineTemplate.content.cloneNode(true);
  const line = fragment.querySelector(".line-item");
  const varietySelect = line.querySelector(".line-variety");
  const gradeSelect = line.querySelector(".line-grade");
  const cratesInput = line.querySelector(".line-crates");
  const weightInput = line.querySelector(".line-weight");
  const priceInput = line.querySelector(".line-price");
  const totalValue = line.querySelector(".line-total-value");
  const removeBtn = line.querySelector(".btn.danger");

  varietySelect.innerHTML = buildVarietyOptions(data?.variety || state.varieties[0]?.name);
  gradeSelect.value = data?.grade || "A";
  cratesInput.value = data?.crates || 1;
  weightInput.value = data?.weight || getAvgWeight(varietySelect.value);
  priceInput.value = data?.price || getPrice(varietySelect.value, gradeSelect.value);

  function updateLine() {
    if (!varietySelect.value) {
      totalValue.textContent = formatRs(0);
      return;
    }
    const crates = Number(cratesInput.value || 0);
    const weight = Number(weightInput.value || 0);
    const price = Number(priceInput.value || 0);
    const total = crates * weight * price;
    totalValue.textContent = formatRs(total);
    updateTotals();
  }

  varietySelect.addEventListener("change", () => {
    weightInput.value = getAvgWeight(varietySelect.value);
    priceInput.value = getPrice(varietySelect.value, gradeSelect.value);
    updateLine();
  });

  gradeSelect.addEventListener("change", () => {
    priceInput.value = getPrice(varietySelect.value, gradeSelect.value);
    updateLine();
  });

  [cratesInput, weightInput, priceInput].forEach((input) =>
    input.addEventListener("input", updateLine)
  );

  removeBtn.addEventListener("click", () => {
    line.remove();
    updateTotals();
  });

  updateLine();
  return fragment;
}

function updateTotals() {
  const lines = Array.from(elements.lineItems.querySelectorAll(".line-item"));
  let gross = 0;
  let deduction = 0;

  lines.forEach((line) => {
    const crates = Number(line.querySelector(".line-crates").value || 0);
    const weight = Number(line.querySelector(".line-weight").value || 0);
    const price = Number(line.querySelector(".line-price").value || 0);
    const grossWeight = crates * weight;
    const grossMoney = grossWeight * price;
    const lineDeduction = grossMoney * deductionRate;
    gross += grossMoney;
    deduction += lineDeduction;
  });

  const advance = Number(elements.advancePaid.value || 0);
  const transport = Number(elements.transportCharge.value || 0);
  const unloading = Number(elements.unloadingCharge.value || 0);
  const net = gross - deduction - advance - transport - unloading;

  elements.grossTotal.textContent = formatRs(gross);
  elements.deductionTotal.textContent = formatRs(deduction);
  elements.advanceTotal.textContent = formatRs(advance);
  elements.transportTotal.textContent = formatRs(transport);
  elements.unloadingTotal.textContent = formatRs(unloading);
  elements.netTotal.textContent = formatRs(Math.max(net, 0));

  renderReceiptPreview();
}

function renderHistory() {
  const dateKey = getTodayKey();
  const receipts = state.receiptsByDate[dateKey] || [];
  elements.historyTable.innerHTML = receipts
    .map(
      (receipt) => `
      <tr>
        <td>${receipt.farmer}</td>
        <td>${receipt.lines.length}</td>
        <td>${formatRs(receipt.gross)}</td>
        <td>${formatRs(receipt.deduction)}</td>
        <td>${formatRs(receipt.advance)}</td>
        <td>${formatRs(receipt.net)}</td>
      </tr>
    `
    )
    .join("");

  elements.statReceipts.textContent = receipts.length.toString();
}

function resetReceiptForm() {
  elements.farmerName.value = "";
  elements.farmerPhone.value = "";
  elements.advancePaid.value = 0;
  elements.transportCharge.value = 0;
  elements.unloadingCharge.value = 0;
  elements.farmerSelect.value = "";
  elements.lineItems.innerHTML = "";
  addLine();
  updateTotals();
}

function addLine() {
  elements.lineItems.appendChild(createLineItem());
}

function buildReceiptPayload() {
  const lines = Array.from(elements.lineItems.querySelectorAll(".line-item")).map((line) => {
    const variety = line.querySelector(".line-variety").value;
    const grade = line.querySelector(".line-grade").value;
    const crates = Number(line.querySelector(".line-crates").value || 0);
    const weight = Number(line.querySelector(".line-weight").value || 0);
    const price = Number(line.querySelector(".line-price").value || 0);
    const grossWeight = crates * weight;
    const deductionWeight = grossWeight * deductionRate;
    const netWeight = grossWeight - deductionWeight;
    const totalGross = grossWeight * price;
    const totalNet = netWeight * price;
    return { variety, grade, crates, weight, price, grossWeight, deductionWeight, netWeight, totalGross, totalNet };
  });

  const gross = lines.reduce((sum, line) => sum + line.totalGross, 0);
  const deduction = lines.reduce((sum, line) => sum + (line.totalGross - line.totalNet), 0);
  const advance = Number(elements.advancePaid.value || 0);
  const transport = Number(elements.transportCharge.value || 0);
  const unloading = Number(elements.unloadingCharge.value || 0);
  const net = Math.max(gross - deduction - advance - transport - unloading, 0);

  return {
    farmer: elements.farmerName.value.trim() || "Unknown",
    phone: elements.farmerPhone.value.trim(),
    date: getTodayKey(),
    lines,
    gross,
    deduction,
    advance,
    transport,
    unloading,
    net,
  };
}

function receiptToText(receipt) {
  const lines = receipt.lines
    .map(
      (line) =>
        `${line.variety} (${line.grade}) - ${line.crates} crates x ${line.weight}kg = Net ${line.netWeight.toFixed(2)}kg x Rs${line.price} = Rs${line.totalNet.toFixed(0)}`
    )
    .join("\n");

  return [
    `Mango Receipt - ${receipt.date}`,
    `Farmer: ${receipt.farmer}`,
    receipt.phone ? `Phone: ${receipt.phone}` : null,
    "",
    lines,
    "",
    `Gross: Rs${receipt.gross.toFixed(0)}`,
    `Deduction (5%): Rs${receipt.deduction.toFixed(0)}`,
    `Advance: Rs${receipt.advance.toFixed(0)}`,
    `Transport: Rs${receipt.transport.toFixed(0)}`,
    `Unloading: Rs${receipt.unloading.toFixed(0)}`,
    `Net Payable: Rs${receipt.net.toFixed(0)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderReceiptPreview() {
  const receipt = buildReceiptPayload();
  elements.receiptDateText.textContent = receipt.date;
  elements.receiptFarmerText.textContent = receipt.farmer;
  elements.receiptGrossText.textContent = formatRs(receipt.gross);
  elements.receiptDeductionText.textContent = formatRs(receipt.deduction);
  elements.receiptAdvanceText.textContent = formatRs(receipt.advance);
  elements.receiptTransportText.textContent = formatRs(receipt.transport);
  elements.receiptUnloadingText.textContent = formatRs(receipt.unloading);
  elements.receiptNetText.textContent = formatRs(receipt.net);

  if (!receipt.lines.length) {
    elements.receiptPreviewTable.innerHTML = `
      <tr>
        <td colspan="9">No line items yet.</td>
      </tr>
    `;
    return;
  }

  elements.receiptPreviewTable.innerHTML = receipt.lines
    .map(
      (line, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${line.grade}</td>
        <td>${line.crates}</td>
        <td>${line.weight}</td>
        <td>${line.grossWeight.toFixed(2)}</td>
        <td>${line.deductionWeight.toFixed(2)}</td>
        <td>${line.netWeight.toFixed(2)}</td>
        <td>${line.price}</td>
        <td>${line.totalNet.toFixed(0)}</td>
      </tr>
    `
    )
    .join("");
}

function buildReceiptPdf(receipt) {
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  let y = 50;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Mango Trade Desk - Receipt", left, y);
  y += 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Date: ${receipt.date}`, left, y);
  y += 18;
  doc.text(`Farmer: ${receipt.farmer}`, left, y);
  y += 18;
  if (receipt.phone) {
    doc.text(`Phone: ${receipt.phone}`, left, y);
    y += 18;
  }

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Items", left, y);
  y += 16;
  doc.setFont("helvetica", "normal");

  receipt.lines.forEach((line) => {
    const row = `${line.variety} (${line.grade}) - ${line.crates} crates x ${line.weight}kg = Net ${line.netWeight.toFixed(2)}kg x Rs${line.price} = Rs${line.totalNet.toFixed(0)}`;
    const split = doc.splitTextToSize(row, 520);
    doc.text(split, left, y);
    y += split.length * 14 + 6;
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text(`Gross: Rs${receipt.gross.toFixed(0)}`, left, y);
  y += 16;
  doc.text(`Deduction (5%): Rs${receipt.deduction.toFixed(0)}`, left, y);
  y += 16;
  doc.text(`Advance: Rs${receipt.advance.toFixed(0)}`, left, y);
  y += 16;
  doc.text(`Transport: Rs${receipt.transport.toFixed(0)}`, left, y);
  y += 16;
  doc.text(`Unloading: Rs${receipt.unloading.toFixed(0)}`, left, y);
  y += 16;
  doc.text(`Net Payable: Rs${receipt.net.toFixed(0)}`, left, y);

  return doc;
}

async function shareOrDownloadPdf(receipt) {
  if (!window.jspdf) {
    alert("PDF library not loaded yet. Please refresh.");
    return;
  }
  const doc = buildReceiptPdf(receipt);
  const pdfBlob = doc.output("blob");
  const fileName = `receipt-${receipt.date}-${receipt.farmer.replace(/\s+/g, "_")}.pdf`;
  const file = new File([pdfBlob], fileName, { type: "application/pdf" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `Mango Receipt - ${receipt.date}`,
        text: "Receipt PDF",
      });
      return;
    } catch (err) {
      // Fall back to download if share is canceled or fails.
    }
  }

  doc.save(fileName);
}

function useFarmerByName(name) {
  const farmer = state.farmers.find((item) => item.name === name);
  if (!farmer) {
    return;
  }
  elements.farmerName.value = farmer.name;
  elements.farmerPhone.value = farmer.phone || "";
  elements.farmerSelect.value = farmer.name;
}

async function syncPriceInputs() {
  const dateKey = getTodayKey();
  const priceMap = state.pricesByDate[dateKey] || {};
  const inputs = Array.from(elements.priceTable.querySelectorAll("input"));
  inputs.forEach((input) => {
    const variety = input.dataset.variety;
    const grade = input.dataset.grade;
    if (!priceMap[variety]) {
      priceMap[variety] = { A: 0, B: 0, C: 0 };
    }
    priceMap[variety][grade] = Number(input.value || 0);
  });
  state.pricesByDate[dateKey] = priceMap;

  if (storageMode === "local") {
    saveLocalState();
    return;
  }
  await apiPostJson("/api/prices", { date: dateKey, prices: priceMap });
}

function bindEvents() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveView(btn.dataset.view);
    });
  });

  elements.priceDate.addEventListener("change", async () => {
    const dateKey = getTodayKey();
    await loadDateData(dateKey);
    renderPriceTable();
    renderHistory();
    resetReceiptForm();
  });

  elements.saveConfigBtn.addEventListener("click", async () => {
    await syncPriceInputs();
    alert("Daily prices saved.");
  });

  elements.varietyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.varietyName.value.trim();
    const weight = Number(elements.varietyWeight.value || 0);
    if (!name || weight <= 0) {
      return;
    }

    const existing = state.varieties.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.name = name;
      existing.avgWeight = weight;
    } else {
      state.varieties.push({ name, avgWeight: weight });
    }

    if (storageMode === "local") {
      saveLocalState();
    } else {
      await apiPostJson("/api/varieties", { name, avgWeight: weight });
    }

    const dateKey = getTodayKey();
    if (!state.pricesByDate[dateKey]) {
      state.pricesByDate[dateKey] = {};
    }
    if (!state.pricesByDate[dateKey][name]) {
      state.pricesByDate[dateKey][name] = { A: 0, B: 0, C: 0 };
    }

    elements.varietyName.value = "";
    elements.varietyWeight.value = "";
    if (storageMode !== "local") {
      await apiPostJson("/api/prices", { date: dateKey, prices: state.pricesByDate[dateKey] });
    } else {
      saveLocalState();
    }

    renderVarietyTable();
    renderPriceTable();
    resetReceiptForm();
  });

  elements.farmerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.farmerListName.value.trim();
    if (!name) {
      return;
    }
    const farmer = {
      name,
      village: elements.farmerVillage.value.trim(),
      phone: elements.farmerListPhone.value.trim(),
      notes: elements.farmerNotes.value.trim(),
    };

    const existing = state.farmers.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      Object.assign(existing, farmer);
    } else {
      state.farmers.push(farmer);
    }

    if (storageMode === "local") {
      saveLocalState();
    } else {
      await apiPostJson("/api/farmers", farmer);
    }

    elements.farmerListName.value = "";
    elements.farmerVillage.value = "";
    elements.farmerListPhone.value = "";
    elements.farmerNotes.value = "";
    renderFarmerTable();
    renderFarmerSelect();
  });

  elements.farmerTable.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const name = target.dataset.farmer;
    if (name) {
      useFarmerByName(name);
      setActiveView("dashboard");
    }
  });

  elements.farmerSelect.addEventListener("change", () => {
    if (!elements.farmerSelect.value) {
      return;
    }
    useFarmerByName(elements.farmerSelect.value);
  });

  elements.addLineBtn.addEventListener("click", addLine);
  elements.advancePaid.addEventListener("input", updateTotals);
  elements.transportCharge.addEventListener("input", updateTotals);
  elements.unloadingCharge.addEventListener("input", updateTotals);

  elements.receiptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await syncPriceInputs();
    const receipt = buildReceiptPayload();
    if (!receipt.lines.length) {
      return;
    }

    const dateKey = getTodayKey();
    if (!state.receiptsByDate[dateKey]) {
      state.receiptsByDate[dateKey] = [];
    }

    if (storageMode === "local") {
      state.receiptsByDate[dateKey].push(receipt);
      saveLocalState();
      renderHistory();
      alert("Receipt saved.");
      resetReceiptForm();
      return;
    }

    const saved = await apiPostJson("/api/receipts", receipt);
    state.receiptsByDate[dateKey].unshift(saved);
    renderHistory();
    alert("Receipt saved.");
    resetReceiptForm();
  });

  elements.printReceipt.addEventListener("click", () => {
    const receipt = buildReceiptPayload();
    const text = receiptToText(receipt);
    const popup = window.open("", "_blank");
    if (popup) {
      popup.document.write(`<pre>${text}</pre>`);
      popup.print();
    }
  });

  elements.sharePdf.addEventListener("click", async () => {
    const receipt = buildReceiptPayload();
    await shareOrDownloadPdf(receipt);
  });

  elements.shareWhatsapp.addEventListener("click", () => {
    const receipt = buildReceiptPayload();
    const text = encodeURIComponent(receiptToText(receipt));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  });

  elements.shareEmail.addEventListener("click", () => {
    const receipt = buildReceiptPayload();
    const subject = encodeURIComponent(`Mango Receipt - ${receipt.date}`);
    const body = encodeURIComponent(receiptToText(receipt));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = elements.loginUser.value.trim() || "admin";
    const pin = elements.loginPin.value.trim();
    if (!pin) {
      elements.loginNote.textContent = "Enter your PIN.";
      return;
    }

    try {
      storageMode = await detectBackend();
      if (storageMode === "local") {
        const auth = loadLocalAuth();
        if (auth.username !== username || auth.pin !== pin) {
          elements.loginNote.textContent = "Incorrect username or PIN.";
          return;
        }
      } else {
        await apiLogin(username, pin);
      }
      currentUser = username;
      elements.currentUser.textContent = `Logged in as: ${currentUser}`;
      elements.loginOverlay.classList.add("hidden");
      elements.loginOverlay.style.display = "none";
      elements.loginNote.textContent = "";
      elements.loginPin.value = "";
      renderReceiptPreview();
    } catch (err) {
      if (storageMode === "api") {
        elements.loginNote.textContent = "Backend not reachable. Start the server and refresh.";
      } else {
        elements.loginNote.textContent = "Login failed. Check your PIN.";
      }
    }
  });

  elements.togglePinForm.addEventListener("click", () => {
    elements.pinForm.classList.toggle("hidden");
  });

  elements.pinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = elements.loginUser.value.trim() || "admin";
    const newPin = elements.newPin.value.trim();
    const confirmPin = elements.confirmPin.value.trim();
    if (!newPin || newPin !== confirmPin) {
      elements.loginNote.textContent = "PINs do not match.";
      return;
    }

    try {
      if (storageMode === "local") {
        saveLocalAuth({ username, pin: newPin });
      } else {
        await apiSetPin(username, newPin);
      }
      elements.loginNote.textContent = "PIN updated. Please login.";
      elements.newPin.value = "";
      elements.confirmPin.value = "";
      elements.pinForm.classList.add("hidden");
    } catch (err) {
      elements.loginNote.textContent = "Unable to save PIN.";
    }
  });

  elements.logoutBtn.addEventListener("click", () => {
    currentUser = null;
    elements.loginOverlay.classList.remove("hidden");
    elements.loginOverlay.style.display = "";
  });

  elements.openPinSettings.addEventListener("click", () => {
    elements.loginOverlay.classList.remove("hidden");
    elements.loginOverlay.style.display = "";
    elements.pinForm.classList.remove("hidden");
  });
}

async function hydrate() {
  await initStorage();
  renderFarmerTable();
  renderFarmerSelect();
  renderVarietyTable();
  renderPriceTable();
  resetReceiptForm();
  renderHistory();
  renderReceiptPreview();

  const storedAuth = storageMode === "local" ? localStorage.getItem("mangoDeskAuth") : null;
  const auth = storageMode === "local" ? loadLocalAuth() : { username: "admin" };
  elements.loginUser.value = auth.username;
  elements.currentUser.textContent = "Logged in as: --";
  if (storageMode === "local" && !storedAuth) {
    elements.loginNote.textContent = "Default PIN is 1234. You can change it below.";
  }
  elements.loginOverlay.classList.remove("hidden");
  elements.loginOverlay.style.display = "";
  setActiveView("dashboard");
}

bindEvents();
hydrate();
