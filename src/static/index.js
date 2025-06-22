const containerEl = document.querySelector("[data-sheet-id]");
let sheetId = parseInt(containerEl.dataset.sheetId);
let sheets = JSON.parse(containerEl.dataset.sheets || "[]");
const sheetTitleEl = document.getElementById("sheet-title");

function getCurrentSheet() {
  return sheets.find((s) => s.id === sheetId);
}

function updateSheetHeader() {
  const s = getCurrentSheet();
  if (s && sheetTitleEl) sheetTitleEl.textContent = s.name;
}
let elements = [];
let selectedId = null;
let dragId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragOrig = null;
let dragMode = "body";

let nextId = Date.now();
function generateId() {
  return nextId++;
}
// Use `var` so `currentView` becomes a property of the global object.
// This allows tests (which run the file in a VM sandbox) to mutate
// `currentView` by assigning to `global.currentView`.
var currentView = "+Z";

function setCurrentView(view) {
  currentView = view;
  // Reset rotation when switching to discrete views
  rotationX = 0;
  rotationY = 0;
  rotationZ = 0;
}

// Rotation state for continuous rotation
let rotationX = 0; // rotation around X axis (pitch)
let rotationY = 0; // rotation around Y axis (yaw) 
let rotationZ = 0; // rotation around Z axis (roll)
let isRotating = false;
let rotationStartX = 0;
let rotationStartY = 0;
let rotationOrigX = 0;
let rotationOrigY = 0;

// Convert rotation angles to a 3x3 rotation matrix
function getRotationMatrix() {
  const cx = Math.cos(rotationX);
  const sx = Math.sin(rotationX);
  const cy = Math.cos(rotationY);
  const sy = Math.sin(rotationY);
  const cz = Math.cos(rotationZ);
  const sz = Math.sin(rotationZ);
  
  // Combined rotation matrix (Z * Y * X)
  return [
    [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
    [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
    [-sy, sx * cy, cx * cy]
  ];
}

// Apply rotation matrix to a 3D point
function rotatePoint(p, matrix) {
  return {
    x: matrix[0][0] * p.x + matrix[0][1] * p.y + matrix[0][2] * p.z,
    y: matrix[1][0] * p.x + matrix[1][1] * p.y + matrix[1][2] * p.z,
    z: matrix[2][0] * p.x + matrix[2][1] * p.y + matrix[2][2] * p.z
  };
}

// Start rotation when shift is held and mouse is dragged
function startRotation(ev) {
  if (!ev.shiftKey) return;
  
  isRotating = true;
  rotationStartX = ev.clientX;
  rotationStartY = ev.clientY;
  rotationOrigX = rotationX;
  rotationOrigY = rotationY;
  
  // Switch to continuous rotation mode
  if (["+X", "-X", "+Y", "-Y", "+Z", "-Z"].includes(currentView)) {
    currentView = "continuous";
  }
  
  document.addEventListener("mousemove", onRotation);
  document.addEventListener("mouseup", endRotation);
  ev.preventDefault();
  ev.stopPropagation();
}

// Handle rotation during mouse drag
function onRotation(ev) {
  if (!isRotating) return;
  
  const dx = ev.clientX - rotationStartX;
  const dy = ev.clientY - rotationStartY;
  
  // Convert screen deltas to rotation angles
  // Scale factors for sensitivity
  const sensitivityX = 0.01; // Y rotation (horizontal mouse movement)
  const sensitivityY = 0.01; // X rotation (vertical mouse movement)
  
  rotationX = rotationOrigX + dy * sensitivityY;
  rotationY = rotationOrigY + dx * sensitivityX;
  
  render();
}

// End rotation
function endRotation() {
  isRotating = false;
  document.removeEventListener("mousemove", onRotation);
  document.removeEventListener("mouseup", endRotation);
}

let zoom = 1;
let panX = 0;
let panY = 0;
let panStartX = 0;
let panStartY = 0;
let panOrigX = 0;
let panOrigY = 0;

function zoomIn() {
  zoom *= 1.25;
  render();
}

function zoomOut() {
  zoom /= 1.25;
  render();
}

function resetPanZoom() {
  zoom = 1;
  panX = 0;
  panY = 0;
  rotationX = 0;
  rotationY = 0;
  rotationZ = 0;
  currentView = "+Z";
  render();
}
const globalProps = { g: 9.81, units: "metric" };
const PROP_LABELS = {
  E: "Young's Modulus",
  A: "Cross Sectional Area",
  I: "Second Moment of Inertia",
};

function renderSheetList() {
  const list = document.getElementById("sheet-list");
  if (!list) return;
  list.innerHTML = "";
  sheets.forEach((s) => {
    const li = document.createElement("li");
    li.className =
      "list-group-item d-flex justify-content-between align-items-center sheet-item";
    if (s.id === sheetId) li.classList.add("active");
    li.dataset.sheetId = s.id;
    li.innerHTML = `<span>${s.name}</span><i class="bi bi-trash-fill delete-sheet" role="button" aria-label="Delete"></i>`;
    list.appendChild(li);
  });
  updateSheetHeader();
}

async function createSheet() {
  const resp = await fetch("/sheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Untitled" }),
  });
  if (resp.ok) {
    const data = await resp.json();
    sheets.push({ id: data.id, name: data.name });
    sheetId = data.id;
    elements = [];
    renderSheetList();
    loadState();
  }
}

async function deleteSheet(id) {
  const resp = await fetch(`/sheet/${id}`, { method: "DELETE" });
  if (resp.ok) {
    sheets = sheets.filter((s) => s.id !== id);
    if (!sheets.length) {
      await createSheet();
      return;
    }
    sheetId = sheets[0].id;
    renderSheetList();
    loadState();
  } else {
    const data = await resp.json().catch(() => ({}));
    if (data.error === "last-sheet") {
      alert("Cannot delete the last sheet.");
    }
  }
}

document.getElementById("new-sheet").addEventListener("click", createSheet);
document.getElementById("sheet-list").addEventListener("click", (ev) => {
  const del = ev.target.closest(".delete-sheet");
  const item = ev.target.closest(".sheet-item");
  if (del && item) {
    deleteSheet(parseInt(item.dataset.sheetId));
    ev.stopPropagation();
    return;
  }
  if (item) {
    const id = parseInt(item.dataset.sheetId);
    if (id !== sheetId) {
      sheetId = id;
      renderSheetList();
      loadState();
    }
  }
});

renderSheetList();

function projectPoint(p) {
  // Check if we're in a discrete view or using continuous rotation
  const discreteViews = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];
  
  if (discreteViews.includes(currentView)) {
    // Use discrete orthographic projection
    switch (currentView) {
      case "+X":
        return { x: p.y, y: -p.z };
      case "-X":
        return { x: -p.y, y: -p.z };
      case "+Y":
        return { x: p.x, y: -p.z };
      case "-Y":
        return { x: -p.x, y: -p.z };
      case "+Z":
        return { x: p.x, y: -p.y };
      case "-Z":
        return { x: -p.x, y: -p.y };
    }
  } else {
    // Use continuous rotation
    const matrix = getRotationMatrix();
    const rotated = rotatePoint(p, matrix);
    // Project onto XY plane (looking down Z axis)
    return { x: rotated.x, y: -rotated.y };
  }
}

function unprojectDelta(dx, dy) {
  // Check if we're in a discrete view or using continuous rotation
  const discreteViews = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];
  
  if (discreteViews.includes(currentView)) {
    // Use discrete orthographic projection
    switch (currentView) {
      case "+X":
        return { y: dx, z: -dy };
      case "-X":
        return { y: -dx, z: -dy };
      case "+Y":
        return { x: dx, z: -dy };
      case "-Y":
        return { x: -dx, z: -dy };
      case "+Z":
        return { x: dx, y: -dy };
      case "-Z":
        return { x: -dx, y: -dy };
    }
  } else {
    // Use continuous rotation - approximate for small deltas
    const matrix = getRotationMatrix();
    // For small deltas, we can approximate by applying inverse rotation
    // This is a simplified approach - for more accuracy we'd need full matrix inverse
    const scale = 1 / zoom;
    return { x: dx * scale, y: -dy * scale, z: 0 };
  }
}
const SNAP_PIXELS = 10;
const LOAD_LENGTH_SCALE = 0.001;

function screenCoords(p) {
  const svg = document.getElementById("canvas");
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 + panX;
  const cy = rect.height / 2 + panY;
  const proj = projectPoint(p);
  return { x: cx + (proj.x || 0) * zoom, y: cy + (proj.y || 0) * zoom };
}

function distanceScreen(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment2D(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

function axisInfo(view) {
  if (view === "continuous") {
    // For continuous rotation, use a default that works with the rotation matrix
    return { h: { axis: "x", sign: 1 }, v: { axis: "y", sign: -1 } };
  }
  
  switch (view) {
    case "+X":
      return { h: { axis: "y", sign: 1 }, v: { axis: "z", sign: -1 } };
    case "-X":
      return { h: { axis: "y", sign: -1 }, v: { axis: "z", sign: -1 } };
    case "+Y":
      return { h: { axis: "x", sign: 1 }, v: { axis: "z", sign: -1 } };
    case "-Y":
      return { h: { axis: "x", sign: -1 }, v: { axis: "z", sign: -1 } };
    case "+Z":
      return { h: { axis: "x", sign: 1 }, v: { axis: "y", sign: -1 } };
    case "-Z":
      return { h: { axis: "x", sign: -1 }, v: { axis: "y", sign: -1 } };
  }
}

const axisDims = { x: "width", y: "height", z: "depth" };

function planeCorners(el) {
  const l = (el.length ?? 40) / 2;
  const w = (el.width ?? 40) / 2;
  const n = (el.normal || "Z").toUpperCase();
  if (n === "X") {
    return [
      { x: el.x, y: el.y - l, z: el.z - w },
      { x: el.x, y: el.y + l, z: el.z - w },
      { x: el.x, y: el.y + l, z: el.z + w },
      { x: el.x, y: el.y - l, z: el.z + w },
    ];
  } else if (n === "Y") {
    return [
      { x: el.x - l, y: el.y, z: el.z - w },
      { x: el.x + l, y: el.y, z: el.z - w },
      { x: el.x + l, y: el.y, z: el.z + w },
      { x: el.x - l, y: el.y, z: el.z + w },
    ];
  }
  return [
    { x: el.x - l, y: el.y - w, z: el.z },
    { x: el.x + l, y: el.y - w, z: el.z },
    { x: el.x + l, y: el.y + w, z: el.z },
    { x: el.x - l, y: el.y + w, z: el.z },
  ];
}

function planeScreenRect(el) {
  const pts = planeCorners(el).map(screenCoords);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function solidScreenRect(el) {
  const info = axisInfo(currentView);
  const h = (el[axisDims[info.h.axis]] ?? 30) * zoom;
  const v = (el[axisDims[info.v.axis]] ?? 30) * zoom;
  const c = screenCoords(el);
  return {
    left: c.x - h / 2,
    right: c.x + h / 2,
    top: c.y - v / 2,
    bottom: c.y + v / 2,
  };
}

function nearestPointOnLine(p, a, b) {
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
  const ab2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  if (ab2 === 0) return { ...a };
  let t = (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t, z: a.z + ab.z * t };
}

function getSnapPoints(ignoreId) {
  const pts = [];
  elements.forEach((e) => {
    if (e.id === ignoreId) return;
    if (e.type === "Support")
      pts.push({ x: e.x, y: e.y, z: e.z, kind: e.type });
    if (e.type === "Load") {
      pts.push({ x: e.x, y: e.y, z: e.z, kind: "Load" });
      pts.push({
        x: e.x2 ?? e.x,
        y: e.y2 ?? e.y,
        z: e.z2 ?? e.z,
        kind: "Load",
      });
    }
    if (e.type === "Member" || e.type === "Cable") {
      pts.push({ x: e.x, y: e.y, z: e.z, kind: "End" });
      pts.push({ x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z, kind: "End" });
    }
    if (e.type === "Plane") {
      const s = 20;
      const corners = planeCorners({ ...e, length: s * 2, width: s * 2 });
      corners.forEach((c) =>
        pts.push({ x: c.x, y: c.y, z: c.z, kind: "PlaneCorner" }),
      );
    }
    if (e.type === "Solid") {
      const s = 15;
      [-s, s].forEach((dx) =>
        [-s, s].forEach((dy) =>
          [-s, s].forEach((dz) =>
            pts.push({
              x: e.x + dx,
              y: e.y + dy,
              z: e.z + dz,
              kind: "SolidCorner",
            }),
          ),
        ),
      );
      [-s, s].forEach((dx) =>
        pts.push({ x: e.x + dx, y: e.y, z: e.z, kind: "FaceCenter" }),
      );
      [-s, s].forEach((dy) =>
        pts.push({ x: e.x, y: e.y + dy, z: e.z, kind: "FaceCenter" }),
      );
      [-s, s].forEach((dz) =>
        pts.push({ x: e.x, y: e.y, z: e.z + dz, kind: "FaceCenter" }),
      );
    }
  });
  return pts;
}

function getSnapLines(ignoreId) {
  const lines = [];
  elements.forEach((e) => {
    if (e.id === ignoreId) return;
    if (e.type === "Member" || e.type === "Cable" || e.type === "Load") {
      lines.push({
        p1: { x: e.x, y: e.y, z: e.z },
        p2: { x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z },
      });
    }
  });
  return lines;
}

function applySnapping(el) {
  const pts = getSnapPoints(el.id);
  const lines = getSnapLines(el.id);

  function snapObj(obj) {
    const sc = screenCoords(obj);
    let best = null;
    let bestDist = SNAP_PIXELS;
    pts.forEach((pt) => {
      const d = distanceScreen(sc, screenCoords(pt));
      if (d < bestDist) {
        best = pt;
        bestDist = d;
      }
    });
    lines.forEach((line) => {
      const near = nearestPointOnLine(obj, line.p1, line.p2);
      const d = distanceScreen(sc, screenCoords(near));
      if (d < bestDist) {
        best = near;
        bestDist = d;
      }
    });
    if (best) {
      obj.x = best.x;
      obj.y = best.y;
      obj.z = best.z;
    }
  }

  if (el.type === "Support") {
    snapObj(el);
  } else if (el.type === "Load") {
    const base = { x: el.x, y: el.y, z: el.z };
    const tip = { x: el.x2 ?? el.x, y: el.y2 ?? el.y, z: el.z2 ?? el.z };
    snapObj(base);
    snapObj(tip);
    el.x = base.x;
    el.y = base.y;
    el.z = base.z;
    el.x2 = tip.x;
    el.y2 = tip.y;
    el.z2 = tip.z;
  } else if (el.type === "Member" || el.type === "Cable") {
    const p1 = { x: el.x, y: el.y, z: el.z };
    const p2 = { x: el.x2 ?? el.x, y: el.y2 ?? el.y, z: el.z2 ?? el.z };
    snapObj(p1);
    snapObj(p2);
    el.x = p1.x;
    el.y = p1.y;
    el.z = p1.z;
    el.x2 = p2.x;
    el.y2 = p2.y;
    el.z2 = p2.z;
  } else {
    snapObj(el);
  }
}

function addNumberInput(container, label, prop, el) {
  const div = document.createElement("div");
  div.className = "mb-2";
  div.innerHTML = `<label class='form-label'>${label}</label><input id='prop-${prop}' class='form-control form-control-sm' type='number' value='${el[prop] ?? 0}'>`;
  const input = div.querySelector("input");
  input.addEventListener("input", (ev) => {
    const v = parseFloat(ev.target.value);
    el[prop] = Number.isFinite(v) ? v : 0;
    if (prop === "amount" && el.type === "Load") {
      const dx = (el.x2 ?? el.x) - el.x;
      const dy = (el.y2 ?? el.y) - el.y;
      const dz = (el.z2 ?? el.z) - el.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const newLen = el.amount * LOAD_LENGTH_SCALE;
      const scale = newLen / len;
      el.x2 = el.x + dx * scale;
      el.y2 = el.y + dy * scale;
      el.z2 = el.z + dz * scale;
    }
    render(false);
    saveState();
  });
  container.appendChild(div);
}

function renderProperties() {
  const pane = document.getElementById("props-content");
  pane.innerHTML = "";
  if (selectedId !== null) {
    const el = elements.find((e) => e.id === selectedId);
    if (el) {
      const form = document.createElement("div");
      form.innerHTML = `<div class="mb-2">Type: <strong>${el.type}</strong></div>`;
      ["x", "y", "z"].forEach((p) => addNumberInput(form, p, p, el));
      if (el.type === "Member" || el.type === "Cable" || el.type === "Load") {
        ["x2", "y2", "z2"].forEach((p) => addNumberInput(form, p, p, el));
      }
      if (el.type === "Member" || el.type === "Cable") {
        ["E", "A", "I"].forEach((p) =>
          addNumberInput(form, `${PROP_LABELS[p]} (${p})`, p, el),
        );
      }
      if (el.type === "Plane") {
        ["length", "width"].forEach((p) => addNumberInput(form, p, p, el));
      } else if (el.type === "Solid") {
        ["width", "height", "depth"].forEach((p) =>
          addNumberInput(form, p, p, el),
        );
      } else if (el.type === "Support") {
        ["ux", "uy", "rz"].forEach((p) => {
          const div = document.createElement("div");
          div.className = "form-check form-check-inline me-2";
          div.innerHTML = `<input class='form-check-input' type='checkbox' id='prop-${p}'> <label class='form-check-label' for='prop-${p}'>${p}</label>`;
          const input = div.querySelector("input");
          input.checked = el[p] !== false;
          input.addEventListener("change", () => {
            el[p] = input.checked;
            saveState();
          });
          form.appendChild(div);
        });
      } else if (el.type === "Load") {
        const unit = globalProps.units === "metric" ? "N" : "lb";
        addNumberInput(form, `amount (${unit})`, "amount", el);
      }
      pane.appendChild(form);
      document.getElementById("delete-btn").disabled = false;
    }
  } else {
    document.getElementById("delete-btn").disabled = true;
  }

  const globalDiv = document.createElement("div");
  globalDiv.innerHTML = `<hr><h6>Global</h6>
    <div class='mb-2'><label class='form-label'>g</label><input id='global-g' class='form-control form-control-sm' type='number' value='${globalProps.g}'></div>
    <div class='mb-2'><label class='form-label'>Units</label><select id='global-units' class='form-select form-select-sm'>
      <option value='metric'>Metric</option><option value='imperial'>Imperial</option></select></div>`;
  pane.appendChild(globalDiv);
  const gInput = globalDiv.querySelector("#global-g");
  gInput.addEventListener("input", (ev) => {
    const v = parseFloat(ev.target.value);
    globalProps.g = Number.isFinite(v) ? v : 0;
  });
  const sel = globalDiv.querySelector("#global-units");
  sel.value = globalProps.units;
  sel.addEventListener("change", (ev) => {
    const old = globalProps.units;
    globalProps.units = ev.target.value;
    if (old !== globalProps.units) {
      if (globalProps.units === "metric") {
        globalProps.g /= 3.28084;
      } else {
        globalProps.g *= 3.28084;
      }
    }
    renderProperties();
  });
}

// Update view button states based on current view
function updateViewButtonStates() {
  const discreteViews = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];
  document.querySelectorAll(".view-btn").forEach((btn) => {
    if (discreteViews.includes(currentView)) {
      btn.classList.toggle("active", btn.dataset.view === currentView);
    } else {
      btn.classList.remove("active");
    }
  });
}

function render(updateProps = true) {
  const svg = document.getElementById("canvas");
  svg.innerHTML = "";
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 + panX;
  const cy = rect.height / 2 + panY;
  
  // Update current view display
  if (currentView === "continuous") {
    const rx = (rotationX * 180 / Math.PI).toFixed(1);
    const ry = (rotationY * 180 / Math.PI).toFixed(1);
    document.getElementById("current-view").textContent = `Rotated (X:${rx}°, Y:${ry}°)`;
  } else {
    document.getElementById("current-view").textContent = currentView;
  }

  elements.forEach((el) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.dataset.id = el.id;
    g.style.cursor = "move";
    g.addEventListener("mousedown", startDrag);
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      selectElement(el.id);
    });

    let shape;
    if (el.type === "Member" || el.type === "Cable") {
      const p1 = projectPoint({ x: el.x, y: el.y, z: el.z });
      const p2 = projectPoint({
        x: el.x2 ?? el.x,
        y: el.y2 ?? el.y,
        z: el.z2 ?? el.z,
      });
      shape = document.createElementNS("http://www.w3.org/2000/svg", "line");
      shape.setAttribute("x1", cx + (p1.x || 0) * zoom);
      shape.setAttribute("y1", cy + (p1.y || 0) * zoom);
      shape.setAttribute("x2", cx + (p2.x || 0) * zoom);
      shape.setAttribute("y2", cy + (p2.y || 0) * zoom);
      shape.setAttribute("stroke", "blue");
      shape.setAttribute("stroke-width", 2);
      if (el.type === "Cable") shape.setAttribute("stroke-dasharray", "4 2");
    } else {
      const p = projectPoint({ x: el.x, y: el.y, z: el.z });
      const sx = cx + (p.x || 0) * zoom;
      const sy = cy + (p.y || 0) * zoom;
      if (el.type === "Plane") {
        // Always render planes in continuous rotation mode
        // In discrete mode, only render if normal matches view
        if (currentView !== "continuous" && el.normal && el.normal !== currentView[1]) return;
        const pts = planeCorners(el).map((p) => {
          const pr = projectPoint(p);
          return [cx + (pr.x || 0) * zoom, cy + (pr.y || 0) * zoom];
        });
        shape = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        );
        shape.setAttribute("points", pts.map((pt) => pt.join(",")).join(" "));
        shape.setAttribute("fill", "rgba(0,0,255,0.2)");
        shape.setAttribute("stroke", "blue");
      } else if (el.type === "Solid") {
        shape = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const info = axisInfo(currentView);
        const h = (el[axisDims[info.h.axis]] ?? 30) * zoom;
        const v = (el[axisDims[info.v.axis]] ?? 30) * zoom;
        shape.setAttribute("x", sx - h / 2);
        shape.setAttribute("y", sy - v / 2);
        shape.setAttribute("width", h);
        shape.setAttribute("height", v);
        shape.setAttribute("fill", "rgba(0,0,255,0.4)");
        shape.setAttribute("stroke", "blue");
      } else if (el.type === "Load") {
        const tip = projectPoint({
          x: el.x2 ?? el.x,
          y: el.y2 ?? el.y,
          z: el.z2 ?? el.z,
        });
        const sx1 = cx + (tip.x || 0) * zoom;
        const sy1 = cy + (tip.y || 0) * zoom;
        const sx2 = sx;
        const sy2 = sy;
        shape = document.createElementNS("http://www.w3.org/2000/svg", "line");
        shape.setAttribute("x1", sx1);
        shape.setAttribute("y1", sy1);
        shape.setAttribute("x2", sx2);
        shape.setAttribute("y2", sy2);
        shape.setAttribute("stroke", "red");
        shape.setAttribute("stroke-width", 2);
        const arrow = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        );
        const dx = sx1 - sx2;
        const dy = sy1 - sy2;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const b1x = sx1 + nx * 4 * zoom;
        const b1y = sy1 + ny * 4 * zoom;
        const b2x = sx1 - nx * 4 * zoom;
        const b2y = sy1 - ny * 4 * zoom;
        const tx = sx1 + (dx / len) * 5 * zoom;
        const ty = sy1 + (dy / len) * 5 * zoom;
        arrow.setAttribute("points", `${b1x},${b1y} ${b2x},${b2y} ${tx},${ty}`);
        arrow.setAttribute("fill", "red");
        g.appendChild(arrow);
      } else if (el.type === "Support") {
        shape = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        );
        shape.setAttribute(
          "points",
          `${sx - 6 * zoom},${sy + 10 * zoom} ${sx + 6 * zoom},${sy + 10 * zoom} ${sx},${sy}`,
        );
        shape.setAttribute("fill", "green");
      }
    }
    if (shape) g.appendChild(shape);
    if (el.id === selectedId) g.setAttribute("stroke", "orange");
    svg.appendChild(g);
  });

  if (updateProps) {
    renderProperties();
  }

  updateViewButtonStates();
}

function addElement(type) {
  const id = generateId();
  const center = unprojectDelta(-panX / zoom, -panY / zoom);
  const base = {
    id,
    type,
    x: center.x || 0,
    y: center.y || 0,
    z: center.z || 0,
  };
  if (type === "Member" || type === "Cable") {
    const dir = unprojectDelta(40, 0);
    Object.assign(base, {
      x2: base.x + (dir.x || 0),
      y2: base.y + (dir.y || 0),
      z2: base.z + (dir.z || 0),
      E: 200e9,
      A: 0.01,
      I: 1e-6,
    });
  } else if (type === "Plane") {
    base.length = 40;
    base.width = 40;
    base.normal = currentView === "continuous" ? "Z" : currentView[1];
  } else if (type === "Solid") {
    base.width = 30;
    base.height = 30;
    base.depth = 30;
  } else if (type === "Load") {
    const dir = unprojectDelta(0, -20);
    Object.assign(base, {
      x2: base.x + (dir.x || 0),
      y2: base.y + (dir.y || 0),
      z2: base.z + (dir.z || 0),
      amount: 20,
    });
  } else if (type === "Support") {
    base.ux = true;
    base.uy = true;
    base.rz = true;
  }
  elements.push(base);
  applySnapping(base);
  saveState();
  render();
}

function deleteElement() {
  if (selectedId === null) return;
  elements = elements.filter((e) => e.id !== selectedId);
  selectedId = null;
  saveState();
  render();
}

function startDrag(ev) {
  const id = parseInt(
    ev.target.parentNode.dataset.id || ev.target.dataset.id,
    10,
  );
  const el = elements.find((e) => e.id === id);
  if (!el) return;
  const svgRect = document.getElementById("canvas").getBoundingClientRect();
  const mx = ev.clientX - svgRect.left;
  const my = ev.clientY - svgRect.top;
  dragId = id;
  selectedId = id;
  dragStartX = ev.clientX;
  dragStartY = ev.clientY;
  dragOrig = JSON.parse(JSON.stringify(el));
  dragMode = "body";
  if (el.type === "Member" || el.type === "Cable") {
    const p1 = screenCoords({ x: el.x, y: el.y, z: el.z });
    const p2 = screenCoords({
      x: el.x2 ?? el.x,
      y: el.y2 ?? el.y,
      z: el.z2 ?? el.z,
    });
    if (distanceScreen({ x: mx, y: my }, p1) < 8) dragMode = "start";
    else if (distanceScreen({ x: mx, y: my }, p2) < 8) dragMode = "end";
    else if (distanceToSegment2D({ x: mx, y: my }, p1, p2) < 6)
      dragMode = "body";
  } else if (el.type === "Load") {
    const base = screenCoords({ x: el.x, y: el.y, z: el.z });
    const tipSC = screenCoords({
      x: el.x2 ?? el.x,
      y: el.y2 ?? el.y,
      z: el.z2 ?? el.z,
    });
    if (distanceScreen({ x: mx, y: my }, base) < 8) dragMode = "base";
    else if (distanceScreen({ x: mx, y: my }, tipSC) < 8) dragMode = "tip";
    else if (distanceToSegment2D({ x: mx, y: my }, base, tipSC) < 6)
      dragMode = "body";
  } else if (el.type === "Plane" || el.type === "Solid") {
    const rect =
      el.type === "Plane" ? planeScreenRect(el) : solidScreenRect(el);
    const m = 6;
    if (
      Math.abs(mx - rect.left) < m &&
      my >= rect.top - m &&
      my <= rect.bottom + m
    )
      dragMode = "left";
    else if (
      Math.abs(mx - rect.right) < m &&
      my >= rect.top - m &&
      my <= rect.bottom + m
    )
      dragMode = "right";
    else if (
      Math.abs(my - rect.top) < m &&
      mx >= rect.left - m &&
      mx <= rect.right + m
    )
      dragMode = "top";
    else if (
      Math.abs(my - rect.bottom) < m &&
      mx >= rect.left - m &&
      mx <= rect.right + m
    )
      dragMode = "bottom";
    else dragMode = "body";
  }
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", endDrag);
  ev.stopPropagation();
}

function onDrag(ev) {
  if (dragId === null) return;
  const el = elements.find((e) => e.id === dragId);
  if (!el) return;
  const dx = (ev.clientX - dragStartX) / zoom;
  const dy = (ev.clientY - dragStartY) / zoom;
  const delta = unprojectDelta(dx, dy);
  if (el.type === "Member" || el.type === "Cable") {
    if (dragMode === "start") {
      ["x", "y", "z"].forEach((k) => {
        el[k] = dragOrig[k] + (delta[k] || 0);
      });
    } else if (dragMode === "end") {
      ["x2", "y2", "z2"].forEach((k) => {
        const a = k[0];
        el[k] = dragOrig[k] + (delta[a] || 0);
      });
    } else {
      ["x", "y", "z", "x2", "y2", "z2"].forEach((k) => {
        const a = k[0];
        el[k] = dragOrig[k] + (delta[a] || 0);
      });
    }
  } else if (el.type === "Load") {
    if (dragMode === "base") {
      ["x", "y", "z"].forEach((k) => {
        if (delta[k] !== undefined) el[k] = dragOrig[k] + delta[k];
      });
    } else if (dragMode === "tip") {
      ["x2", "y2", "z2"].forEach((k) => {
        const a = k[0];
        el[k] = dragOrig[k] + delta[a];
      });
    } else {
      ["x", "y", "z", "x2", "y2", "z2"].forEach((k) => {
        const a = k[0];
        el[k] = dragOrig[k] + delta[a];
      });
    }
    if (dragMode === "tip") {
      el.amount = Math.hypot(
        (el.x2 ?? el.x) - el.x,
        (el.y2 ?? el.y) - el.y,
        (el.z2 ?? el.z) - el.z,
      );
    }
  } else if (el.type === "Plane") {
    const info = axisInfo(currentView);
    const dh = dx;
    const dv = dy;
    const dhWorld = dh * info.h.sign;
    const dvWorld = dv * info.v.sign;
    if (dragMode === "left") {
      el.length = Math.max(1, dragOrig.length - dh);
      el[info.h.axis] = dragOrig[info.h.axis] + dhWorld / 2;
    } else if (dragMode === "right") {
      el.length = Math.max(1, dragOrig.length + dh);
      el[info.h.axis] = dragOrig[info.h.axis] + dhWorld / 2;
    } else if (dragMode === "top") {
      el.width = Math.max(1, dragOrig.width - dv);
      el[info.v.axis] = dragOrig[info.v.axis] + dvWorld / 2;
    } else if (dragMode === "bottom") {
      el.width = Math.max(1, dragOrig.width + dv);
      el[info.v.axis] = dragOrig[info.v.axis] + dvWorld / 2;
    } else {
      ["x", "y", "z"].forEach((k) => {
        if (delta[k] !== undefined) el[k] = dragOrig[k] + delta[k];
      });
    }
  } else if (el.type === "Solid") {
    const info = axisInfo(currentView);
    const dh = dx;
    const dv = dy;
    const dhWorld = dh * info.h.sign;
    const dvWorld = dv * info.v.sign;
    const hProp = axisDims[info.h.axis];
    const vProp = axisDims[info.v.axis];
    if (dragMode === "left") {
      el[hProp] = Math.max(1, dragOrig[hProp] - dh);
      el[info.h.axis] = dragOrig[info.h.axis] + dhWorld / 2;
    } else if (dragMode === "right") {
      el[hProp] = Math.max(1, dragOrig[hProp] + dh);
      el[info.h.axis] = dragOrig[info.h.axis] + dhWorld / 2;
    } else if (dragMode === "top") {
      el[vProp] = Math.max(1, dragOrig[vProp] - dv);
      el[info.v.axis] = dragOrig[info.v.axis] + dvWorld / 2;
    } else if (dragMode === "bottom") {
      el[vProp] = Math.max(1, dragOrig[vProp] + dv);
      el[info.v.axis] = dragOrig[info.v.axis] + dvWorld / 2;
    } else {
      ["x", "y", "z"].forEach((k) => {
        if (delta[k] !== undefined) el[k] = dragOrig[k] + delta[k];
      });
    }
  } else {
    ["x", "y", "z"].forEach((k) => {
      if (delta[k] !== undefined) el[k] = dragOrig[k] + delta[k];
    });
  }
  render();
}

function endDrag() {
  if (dragId === null) return;
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", endDrag);
  const el = elements.find((e) => e.id === dragId);
  if (el) applySnapping(el);
  dragId = null;
  dragMode = "body";
  saveState();
  render();
}

function startPan(ev) {
  // If shift is held, start rotation instead of panning
  if (ev.shiftKey) {
    startRotation(ev);
    return;
  }
  
  panStartX = ev.clientX;
  panStartY = ev.clientY;
  panOrigX = panX;
  panOrigY = panY;
  document.addEventListener("mousemove", onPan);
  document.addEventListener("mouseup", endPan);
}

function onPan(ev) {
  panX = panOrigX + (ev.clientX - panStartX);
  panY = panOrigY + (ev.clientY - panStartY);
  render();
}

function endPan() {
  document.removeEventListener("mousemove", onPan);
  document.removeEventListener("mouseup", endPan);
}

function onCanvasWheel(ev) {
  if (!ev.shiftKey) return;
  ev.preventDefault();
  const factor = Math.exp(-ev.deltaY / 200);
  zoom *= factor;
  render();
}

async function saveState() {
  await fetch("/sheet/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sheet_id: sheetId, elements }),
  });
}

async function loadState() {
  const resp = await fetch(`/sheet/${sheetId}`);
  if (resp.ok) {
    const data = await resp.json();
    const s = sheets.find((sh) => sh.id === data.id);
    if (s) {
      s.name = data.name;
    }
    elements = (data.elements || []).map((e) => {
      const obj = {
        id: e.id,
        type: e.type || "Joint",
        x: e.x ?? 0,
        y: e.y ?? 0,
        z: e.z ?? 0,
      };
      if (obj.type === "Member" || obj.type === "Cable") {
        obj.x2 = e.x2 ?? obj.x;
        obj.y2 = e.y2 ?? obj.y;
        obj.z2 = e.z2 ?? obj.z;
        obj.E = e.E ?? 200e9;
        obj.A = e.A ?? 0.01;
        obj.I = e.I ?? 1e-6;
      } else if (obj.type === "Plane") {
        obj.length = e.length ?? 40;
        obj.width = e.width ?? 40;
        obj.normal = e.normal ?? currentView[1];
      } else if (obj.type === "Solid") {
        obj.width = e.width ?? 30;
        obj.height = e.height ?? 30;
        obj.depth = e.depth ?? 30;
      } else if (obj.type === "Load") {
        obj.x2 = e.x2 ?? obj.x;
        obj.y2 = e.y2 ?? obj.y;
        obj.z2 = e.z2 ?? obj.z;
        obj.amount =
          e.amount ?? Math.hypot(obj.x2 - obj.x, obj.y2 - obj.y, obj.z2 - obj.z);
      } else if (obj.type === "Support") {
        obj.ux = e.ux !== false;
        obj.uy = e.uy !== false;
        obj.rz = e.rz !== false;
      }
      return obj;
    });
    let maxId = elements.reduce((m, e) => Math.max(m, e.id), 0);
    nextId = Math.max(Date.now(), maxId + 1);
    updateSheetHeader();
    render();
  }
}

document.getElementById("add-btn").addEventListener("click", () => {
  const type = document.getElementById("element-type").value;
  addElement(type);
});
document.getElementById("delete-btn").addEventListener("click", deleteElement);
document.getElementById("canvas").addEventListener("click", () => {
  selectedId = null;
  render();
});
document.getElementById("canvas").addEventListener("mousedown", startPan);
document.getElementById("canvas").addEventListener("wheel", onCanvasWheel);
document.getElementById("zoom-in").addEventListener("click", zoomIn);
document.getElementById("zoom-out").addEventListener("click", zoomOut);
document.getElementById("home-btn").addEventListener("click", resetPanZoom);
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Delete" || ev.key === "Backspace" || ev.key === "Del") {
    const active = document.activeElement;
    if (
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable)
    ) {
      return;
    }
    deleteElement();
  }
});

document.getElementById("edit-title").addEventListener("click", async () => {
  const sheet = getCurrentSheet();
  if (!sheet) return;
  const name = prompt("Sheet name", sheet.name);
  if (name && name.trim() && name !== sheet.name) {
    const resp = await fetch(`/sheet/${sheet.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (resp.ok) {
      const data = await resp.json();
      sheet.name = data.name;
      renderSheetList();
    }
  }
});

document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setCurrentView(btn.dataset.view);
    document
      .querySelectorAll(".view-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
});

function buildModel() {
  // First, collect all unique points from all elements
  const pointMap = new Map();
  let nextPointId = 1;
  
  function getOrCreatePoint(x, y, z = 0) {
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    if (!pointMap.has(key)) {
      pointMap.set(key, { id: nextPointId++, x, y, z });
    }
    return pointMap.get(key);
  }
  
  // Collect points from all elements
  elements.forEach((el) => {
    if (el.type === "Support") {
      getOrCreatePoint(el.x, el.y, el.z);
    } else if (el.type === "Load") {
      getOrCreatePoint(el.x, el.y, el.z);
    } else if (el.type === "Member" || el.type === "Cable") {
      getOrCreatePoint(el.x, el.y, el.z);
      getOrCreatePoint(el.x2 ?? el.x, el.y2 ?? el.y, el.z2 ?? el.z);
    }
  });
  
  const points = Array.from(pointMap.values());
  
  // Create mapping from coordinates to point IDs
  const coordToPointId = new Map();
  points.forEach(point => {
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)},${point.z.toFixed(6)}`;
    coordToPointId.set(key, point.id);
  });
  
  function getPointId(x, y, z = 0) {
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    return coordToPointId.get(key);
  }

  const members = elements
    .filter((e) => e.type === "Member" || e.type === "Cable")
    .map((e) => ({
      start: getPointId(e.x, e.y, e.z),
      end: getPointId(e.x2 ?? e.x, e.y2 ?? e.y, e.z2 ?? e.z),
      E: e.E ?? 200e9,
      A: e.A ?? 0.01,
      I: e.I ?? 1e-6,
    }));

  const loads = elements
    .filter((e) => e.type === "Load")
    .map((e) => {
      const dx = ((e.x2 ?? e.x) - e.x);
      const dy = ((e.y2 ?? e.y) - e.y);
      const len = Math.hypot(dx, dy) || 1;
      const amt = e.amount ?? 0;
      return {
        point: getPointId(e.x, e.y, e.z),
        fx: (amt * dx) / len,
        fy: (amt * dy) / len,
        mz: 0,
        amount: amt,
      };
    });

  const supports = elements
    .filter((e) => e.type === "Support")
    .map((e) => ({
      point: getPointId(e.x, e.y, e.z),
      ux: e.ux !== false,
      uy: e.uy !== false,
      rz: e.rz !== false,
    }));

  return { points, members, loads, supports };
}

async function solveModel() {
  const payload = buildModel();
  console.log("Solving model:", payload);
  const resp = await fetch("/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const out = document.getElementById("solve-output");
  if (!resp.ok) {
    out.textContent = "Error solving";
    return;
  }
  const data = await resp.json();
  const lines = [];
  if (data.issues && data.issues.length) {
    lines.push("Issues:");
    for (const issue of data.issues) {
      lines.push(" - " + issue);
    }
    lines.push("");
  }
  lines.push("Displacements:");
  for (const [pointId, v] of Object.entries(data.displacements || {})) {
    const point = payload.points.find(p => p.id === parseInt(pointId));
    if (point) {
      lines.push(
        `Point ${pointId} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}): ux=${(+v[0]).toExponential(3)} m, uy=${(+v[1]).toExponential(3)} m, rz=${(+v[2]).toExponential(3)} rad`,
      );
    }
  }
  lines.push("Reactions:");
  for (const [pointId, v] of Object.entries(data.reactions || {})) {
    const point = payload.points.find(p => p.id === parseInt(pointId));
    if (point) {
      lines.push(
        `Point ${pointId} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}): fx=${(+v[0]).toExponential(3)} N, fy=${(+v[1]).toExponential(3)} N, mz=${(+v[2]).toExponential(3)} N·m`,
      );
    }
  }
  out.textContent = lines.join("\n");
}

document.getElementById("solve-btn").addEventListener("click", solveModel);

loadState();
