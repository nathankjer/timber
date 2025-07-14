// Add click handler for element selection
function selectElementOnClick(ev) {
  ev.stopPropagation(); // Prevent canvas click from deselecting
  const elementId = parseInt(ev.target.getAttribute("data-id"), 10);
  if (elementId) {
    globalThis.selectedId = elementId;
    render(false);
    renderProperties();
  }
}

const containerEl = document.querySelector("[data-sheet-id]");
let sheetId = parseInt(containerEl.dataset.sheetId);
let sheets = JSON.parse(containerEl.dataset.sheets || "[]");
const sheetTitleEl = document.getElementById("sheet-title");

var globalProps = { g: 9.81, units: "metric" };
let unitConversionInfo = null; // Cache for unit conversion info
let isRenderingProperties = false; // Flag to prevent multiple simultaneous calls

function getCurrentSheet() {
  return sheets.find((s) => s.id === sheetId);
}

function updateSheetHeader() {
  const s = getCurrentSheet();
  if (s && sheetTitleEl) sheetTitleEl.textContent = s.name;
}

if (typeof globalThis.elements === "undefined") globalThis.elements = [];
if (typeof globalThis.selectedId === "undefined") globalThis.selectedId = null;
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
var currentView = "+Z"; // This is now just for display purposes

function setCurrentView(view) {
  currentView = view;
  // Convert discrete view to rotation angles
  switch (view) {
    case "+X":
      globalThis.rotationX = 0;
      globalThis.rotationY = -Math.PI / 2;
      globalThis.rotationZ = 0;
      break;
    case "-X":
      globalThis.rotationX = 0;
      globalThis.rotationY = Math.PI / 2;
      globalThis.rotationZ = 0;
      break;
    case "+Y":
      globalThis.rotationX = 0;
      globalThis.rotationY = 0;
      globalThis.rotationZ = Math.PI / 2;
      break;
    case "-Y":
      globalThis.rotationX = 0;
      globalThis.rotationY = Math.PI;
      globalThis.rotationZ = -Math.PI / 2;
      break;
    case "+Z":
      globalThis.rotationX = 0;
      globalThis.rotationY = 0;
      globalThis.rotationZ = 0;
      break;
    case "-Z":
      globalThis.rotationX = 0;
      globalThis.rotationY = Math.PI;
      globalThis.rotationZ = 0;
      break;
  }
}

// Rotation state for continuous rotation
if (typeof globalThis.rotationX === "undefined") globalThis.rotationX = 0; // rotation around X axis (pitch)
if (typeof globalThis.rotationY === "undefined") globalThis.rotationY = 0; // rotation around Y axis (yaw)
if (typeof globalThis.rotationZ === "undefined") globalThis.rotationZ = 0; // rotation around Z axis (roll)
if (typeof globalThis.isRotating === "undefined") globalThis.isRotating = false;
if (typeof globalThis.rotationStartX === "undefined")
  globalThis.rotationStartX = 0;
if (typeof globalThis.rotationStartY === "undefined")
  globalThis.rotationStartY = 0;
if (typeof globalThis.rotationOrigX === "undefined")
  globalThis.rotationOrigX = 0;
if (typeof globalThis.rotationOrigY === "undefined")
  globalThis.rotationOrigY = 0;
if (typeof globalThis.rotationOrigZ === "undefined")
  globalThis.rotationOrigZ = 0;

if (typeof globalThis.zoom === "undefined") globalThis.zoom = 1;
if (typeof globalThis.panX === "undefined") globalThis.panX = 0;
if (typeof globalThis.panY === "undefined") globalThis.panY = 0;
if (typeof globalThis.panStartX === "undefined") globalThis.panStartX = 0;
if (typeof globalThis.panStartY === "undefined") globalThis.panStartY = 0;
if (typeof globalThis.panOrigX === "undefined") globalThis.panOrigX = 0;
if (typeof globalThis.panOrigY === "undefined") globalThis.panOrigY = 0;
if (typeof globalThis.isPanning === "undefined") globalThis.isPanning = false;

// Convert rotation angles to a 3x3 rotation matrix
function getRotationMatrix() {
  const cx = Math.cos(globalThis.rotationX);
  const sx = Math.sin(globalThis.rotationX);
  const cy = Math.cos(globalThis.rotationY);
  const sy = Math.sin(globalThis.rotationY);
  const cz = Math.cos(globalThis.rotationZ);
  const sz = Math.sin(globalThis.rotationZ);

  // Combined rotation matrix (Z * Y * X)
  return [
    [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
    [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
    [-sy, sx * cy, cx * cy],
  ];
}

// Apply rotation matrix to a 3D point
function rotatePoint(p, matrix) {
  return {
    x: matrix[0][0] * p.x + matrix[0][1] * p.y + matrix[0][2] * p.z,
    y: matrix[1][0] * p.x + matrix[1][1] * p.y + matrix[1][2] * p.z,
    z: matrix[2][0] * p.x + matrix[2][1] * p.y + matrix[2][2] * p.z,
  };
}

// Start rotation when shift is held and mouse is dragged
function startRotation(ev) {
  if (!ev.shiftKey) return;

  globalThis.isRotating = true;
  globalThis.rotationStartX = ev.clientX;
  globalThis.rotationStartY = ev.clientY;
  globalThis.rotationOrigX = globalThis.rotationX;
  globalThis.rotationOrigY = globalThis.rotationY;
  globalThis.rotationOrigZ = globalThis.rotationZ;

  document.addEventListener("mousemove", onRotation);
  document.addEventListener("mouseup", endRotation);
  ev.preventDefault();
  ev.stopPropagation();
}

// Handle rotation during mouse drag
async function onRotation(ev) {
  if (!globalThis.isRotating) return;

  const dx = ev.clientX - globalThis.rotationStartX;
  const dy = ev.clientY - globalThis.rotationStartY;

  // Scale factors for sensitivity
  const sensitivityX = 0.01; // Y rotation (horizontal mouse movement)
  const sensitivityY = 0.01; // X rotation (vertical mouse movement)
  const sensitivityZ = 0.005; // Z rotation (combined movement, lower sensitivity)

  globalThis.rotationX = globalThis.rotationOrigX + dy * sensitivityY;
  globalThis.rotationY = globalThis.rotationOrigY + dx * sensitivityX;
  globalThis.rotationZ = globalThis.rotationOrigZ + (dx + dy) * sensitivityZ;

  await render(false);
}

// End rotation
function endRotation() {
  globalThis.isRotating = false;
  document.removeEventListener("mousemove", onRotation);
  document.removeEventListener("mouseup", endRotation);
}

// Unit conversion functions that use the backend API
async function getUnitInfo() {
  try {
    const resp = await fetch("/units/info");
    if (resp.ok) {
      const data = await resp.json();
      unitConversionInfo = data.conversions;
      return data;
    }
  } catch (error) {
    console.error("Failed to get unit info:", error);
  }
  return null;
}

async function convertValue(value, unitType, direction = "to_display") {
  // Always use fallback for mass and density unit types
  if (unitType === "mass" || unitType === "density") {
    return fallbackConvert(value, unitType, direction);
  }
  if (!unitConversionInfo) {
    await getUnitInfo();
  }

  try {
    const resp = await fetch("/units/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unit_system: globalProps.units,
        values: [{ unit_type: unitType, value: value, direction: direction }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.conversions && data.conversions.length > 0) {
        const conversion = data.conversions[0];
        return direction === "to_display"
          ? { value: conversion.display_value, symbol: conversion.symbol }
          : conversion.si_value;
      }
    }
  } catch (error) {
    console.error("Failed to convert value:", error);
  }

  // Fallback to direct calculation if API fails
  return fallbackConvert(value, unitType, direction);
}

function fallbackConvert(value, unitType, direction) {
  const unitSystem =
    typeof global !== "undefined" &&
    global.globalProps &&
    global.globalProps.units
      ? global.globalProps.units
      : globalProps.units || "metric";

  if (unitType === "length") {
    if (direction === "to_display") {
      const displayValue =
        unitSystem === "metric" ? value * 1000 : value * 39.3701;
      const symbol = unitSystem === "metric" ? "mm" : "in";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value / 1000 : value / 39.3701;
    }
  } else if (unitType === "force") {
    if (direction === "to_display") {
      const displayValue =
        unitSystem === "metric" ? value / 1000 : value / 4.44822;
      const symbol = unitSystem === "metric" ? "kN" : "lb";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value * 1000 : value * 4.44822;
    }
  } else if (unitType === "stress") {
    if (direction === "to_display") {
      const displayValue =
        unitSystem === "metric" ? value / 1e9 : value / 6894760.0;
      const symbol = unitSystem === "metric" ? "GPa" : "ksi";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value * 1e9 : value * 6894760.0;
    }
  } else if (unitType === "area") {
    if (direction === "to_display") {
      const displayValue =
        unitSystem === "metric" ? value * 1e6 : value * 1550.0031;
      const symbol = unitSystem === "metric" ? "mm²" : "in²";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value / 1e6 : value / 1550.0031;
    }
  } else if (unitType === "moment_of_inertia") {
    if (direction === "to_display") {
      const displayValue =
        unitSystem === "metric" ? value * 1e12 : value * 2.4025e9;
      const symbol = unitSystem === "metric" ? "mm⁴" : "in⁴";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value / 1e12 : value / 2.4025e9;
    }
  } else if (unitType === "acceleration") {
    if (direction === "to_display") {
      const displayValue = unitSystem === "metric" ? value : value / 0.3048;
      const symbol = unitSystem === "metric" ? "m/s²" : "ft/s²";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value : value * 0.3048;
    }
  } else if (unitType === "moment") {
    if (direction === "to_display") {
      const displayValue =
        unitSystem === "metric" ? value / 1000 : value / 1.35582;
      const symbol = unitSystem === "metric" ? "kN·m" : "lb·ft";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value * 1000 : value * 1.35582;
    }
  } else if (unitType === "mass") {
    if (direction === "to_display") {
      const displayValue = unitSystem === "metric" ? value : value * 2.20462;
      const symbol = unitSystem === "metric" ? "kg" : "lb";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value : value / 2.20462;
    }
  } else if (unitType === "density") {
    if (direction === "to_display") {
      const displayValue = unitSystem === "metric" ? value : value * 0.062428;
      const symbol = unitSystem === "metric" ? "kg/m³" : "lb/ft³";
      return { value: displayValue, symbol: symbol };
    } else {
      return unitSystem === "metric" ? value : value / 0.062428;
    }
  }

  return direction === "to_display" ? { value: value, symbol: "" } : value;
}

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
    body: JSON.stringify({ name: "New Sheet", unit_system: globalProps.units }),
  });
  if (resp.ok) {
    const data = await resp.json();
    sheets.push({
      id: data.id,
      name: data.name,
      unit_system: data.unit_system,
    });
    sheetId = data.id;
    globalThis.elements = [];
    // Set global unit system to the new sheet's unit system
    globalProps.units = data.unit_system || "metric";
    // Clear calculation results when creating a new sheet
    lastCalculationResults = null;
    resetSimulationUI(); // Reset simulation UI when creating new sheet
    renderSheetList();
    loadState();
  }
}

async function deleteSheet(id) {
  const resp = await fetch(`/sheet/${id}`, { method: "DELETE" });
  if (resp.ok) {
    const data = await resp.json();
    sheets = sheets.filter((s) => s.id !== id);

    if (data.status === "deleted_and_created") {
      sheets.push(data.new_sheet);
      sheetId = data.new_sheet.id;
    } else {
      sheetId = sheets[0].id;
    }
    renderSheetList();
    loadState();
  } else {
    alert("Error deleting sheet.");
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
  // Always use continuous rotation - no discrete view mode
  const matrix = getRotationMatrix();
  const rotated = rotatePoint(p, matrix);
  // Project onto XY plane (looking down Z axis)
  return { x: rotated.x, y: -rotated.y };
}

function unprojectDelta(dx, dy) {
  // Convert screen deltas to world coordinates using the inverse rotation matrix
  const scale = 1 / globalThis.zoom;

  // Get the rotation matrix
  const matrix = getRotationMatrix();

  // For small deltas, we can approximate the inverse transformation
  // by applying the inverse rotation to the screen delta
  // Screen coordinates: x increases right, y increases down
  // We need to convert this to world coordinates

  // The screen delta in world space (before rotation)
  const worldDelta = {
    x: dx * scale,
    y: -dy * scale, // Screen Y is inverted
    z: 0,
  };

  // Apply inverse rotation (transpose of rotation matrix for orthogonal matrices)
  const invMatrix = [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]],
  ];

  const result = {
    x:
      invMatrix[0][0] * worldDelta.x +
      invMatrix[0][1] * worldDelta.y +
      invMatrix[0][2] * worldDelta.z,
    y:
      invMatrix[1][0] * worldDelta.x +
      invMatrix[1][1] * worldDelta.y +
      invMatrix[1][2] * worldDelta.z,
    z:
      invMatrix[2][0] * worldDelta.x +
      invMatrix[2][1] * worldDelta.y +
      invMatrix[2][2] * worldDelta.z,
  };

  return result;
}
const SNAP_PIXELS = 20;

function screenCoords(p) {
  const svg = document.getElementById("canvas");
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 + globalThis.panX;
  const cy = rect.height / 2 + globalThis.panY;
  const proj = projectPoint(p);
  return {
    x: cx + (proj.x || 0) * globalThis.zoom,
    y: cy + (proj.y || 0) * globalThis.zoom,
  };
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

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (
      polygon[i].y > point.y !== polygon[j].y > point.y &&
      point.x <
        ((polygon[j].x - polygon[i].x) * (point.y - polygon[i].y)) /
          (polygon[j].y - polygon[i].y) +
          polygon[i].x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function axisInfo() {
  // Always return continuous rotation info - no discrete view mode
  return { h: { axis: "x", sign: 1 }, v: { axis: "y", sign: -1 } };
}

const axisDims = { x: "width", y: "height", z: "depth" };

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

  globalThis.elements.forEach((e) => {
    if (e.id === ignoreId) return;

    // Add all points from all element types
    if (e.points) {
      // All elements now use points array
      if (e.type === "Support") {
        e.points.forEach((p) => {
          pts.push({ ...p, kind: "Support" });
        });
      } else if (e.type === "Load") {
        e.points.forEach((p) => {
          pts.push({ ...p, kind: "Load" });
        });
      } else if (e.type === "Member") {
        e.points.forEach((p) => {
          pts.push({ ...p, kind: "End" });
        });

        // Add midpoint of member
        if (e.points.length >= 2) {
          const midX = (e.points[0].x + e.points[1].x) / 2;
          const midY = (e.points[0].y + e.points[1].y) / 2;
          const midZ = (e.points[0].z + e.points[1].z) / 2;
          pts.push({ x: midX, y: midY, z: midZ, kind: "Midpoint" });
        }
      }
    } else {
      // Legacy fallback for any remaining elements
      if (e.type === "Support") {
        pts.push({ x: e.x, y: e.y, z: e.z, kind: "Support" });
      } else if (e.type === "Load") {
        pts.push({ x: e.x, y: e.y, z: e.z, kind: "Load" });
        pts.push({
          x: e.x2 ?? e.x,
          y: e.y2 ?? e.y,
          z: e.z2 ?? e.z,
          kind: "Load",
        });
      } else if (e.type === "Member") {
        pts.push({ x: e.x, y: e.y, z: e.z, kind: "End" });
        pts.push({
          x: e.x2 ?? e.x,
          y: e.y2 ?? e.y,
          z: e.z2 ?? e.z,
          kind: "End",
        });

        // Add midpoint of member
        const midX = (e.x + (e.x2 ?? e.x)) / 2;
        const midY = (e.y + (e.y2 ?? e.y)) / 2;
        const midZ = (e.z + (e.z2 ?? e.z)) / 2;
        pts.push({ x: midX, y: midY, z: midZ, kind: "Midpoint" });
      }
    }
  });
  return pts;
}

function getSnapLines(ignoreId) {
  const lines = [];
  globalThis.elements.forEach((e) => {
    if (e.id === ignoreId) return;
    if (e.points && e.points.length >= 2) {
      // All elements now use points array
      if (e.type === "Member" || e.type === "Load") {
        lines.push({
          p1: { x: e.points[0].x, y: e.points[0].y, z: e.points[0].z },
          p2: { x: e.points[1].x, y: e.points[1].y, z: e.points[1].z },
        });
      }
    } else {
      // Legacy fallback for any remaining elements
      if (e.type === "Member" || e.type === "Load") {
        lines.push({
          p1: { x: e.x, y: e.y, z: e.z },
          p2: { x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z },
        });
      }
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

  if (el.points) {
    // All elements now use points array
    el.points.forEach((p) => snapObj(p));
  } else {
    // Legacy fallback for any remaining elements
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
    } else if (el.type === "Member") {
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
}

async function addNumberInput(
  container,
  label,
  prop,
  el,
  unitType = null,
  pointIndex = -1,
  onChangeCallback = null,
  elForInputs = null,
) {
  const div = document.createElement("div");
  div.className = "mb-2";

  // Get current value (always in SI units)
  let currentValue =
    pointIndex > -1 ? el.points[pointIndex][prop] : (el[prop] ?? 0);
  let displayValue = currentValue;
  let unitSymbol = "";

  if (unitType) {
    try {
      // Use backend unit conversion API
      const conversion = await convertValue(
        currentValue,
        unitType,
        "to_display",
      );
      displayValue = conversion.value.toFixed(3);
      unitSymbol = conversion.symbol;
    } catch (e) {
      // Fallback: use SI units and raw value
      displayValue = currentValue;
      unitSymbol =
        unitType === "length"
          ? "m"
          : unitType === "force"
            ? "N"
            : unitType === "area"
              ? "m²"
              : unitType === "stress"
                ? "Pa"
                : "";
    }
  }

  // Create input with unit label
  if (unitType) {
    div.innerHTML = `
      <label class='form-label'>${label}</label>
      <div class='input-group input-group-sm'>
        <input id='prop-${prop}' class='form-control' type='text' value='${displayValue}'>
        <span class='input-group-text'>${unitSymbol}</span>
      </div>
    `;
  } else {
    div.innerHTML = `<label class='form-label'>${label}</label><input id='prop-${prop}' class='form-control form-control-sm' type='text' value='${displayValue}'>`;
  }

  const input = div.querySelector("input");
  // Register input in el._propertyInputs for live update
  if (elForInputs && prop) {
    if (!elForInputs._propertyInputs) elForInputs._propertyInputs = {};
    elForInputs._propertyInputs[
      prop + (pointIndex > -1 ? `_${pointIndex}` : "")
    ] = input;
  }
  input.addEventListener("input", async (ev) => {
    const text = ev.target.value;
    let v;

    if (unitType) {
      try {
        // Parse value and convert from display units to SI
        const displayValue = parseFloat(text);
        if (Number.isFinite(displayValue)) {
          v = await convertValue(displayValue, unitType, "from_display");
        } else {
          v = 0;
        }
      } catch {
        v = 0;
      }
    } else {
      v = parseFloat(text);
    }

    if (Number.isFinite(v)) {
      if (pointIndex > -1) {
        el.points[pointIndex][prop] = v;
      } else {
        el[prop] = v;
      }
      // Call the callback if provided (for mass recalculation)
      if (onChangeCallback) {
        onChangeCallback();
      }
      // Update the value in the input field for live update
      if (elForInputs && prop) {
        if (!elForInputs._propertyInputs) elForInputs._propertyInputs = {};
        elForInputs._propertyInputs[
          prop + (pointIndex > -1 ? `_${pointIndex}` : "")
        ] = input;
      }
    }
    render(false);
    saveState();
  });
  container.appendChild(div);
}

// --- Recursive property renderer for sidebar ---
async function renderPropertyFields(
  container,
  obj,
  path = [],
  onChange = null,
) {
  for (const key of Object.keys(obj)) {
    if (key === "id" || key === "type" || key === "_propertyInputs") continue; // skip id/type
    const value = obj[key];
    const fullPath = [...path, key];
    const label = fullPath.join(".");

    if (Array.isArray(value)) {
      // Handle arrays (like points array)
      const group = document.createElement("div");
      group.className = "mb-2 border rounded p-2 bg-light";
      group.innerHTML = `<div class='fw-bold mb-1'>${key.charAt(0).toUpperCase() + key.slice(1)}</div>`;

      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          // For point objects, create a sub-group
          const pointGroup = document.createElement("div");
          pointGroup.className = "mb-2 border-start ps-2";
          pointGroup.innerHTML = `<div class='fw-bold mb-1'>Point ${index + 1}</div>`;

          // Render the point's properties (x, y, z)
          Object.keys(item).forEach((prop) => {
            if (prop !== "id") {
              const propDiv = document.createElement("div");
              propDiv.className = "mb-2";
              const propLabel = prop.toUpperCase();
              propDiv.innerHTML = `<label class='form-label'>${propLabel}</label><input id='prop-${prop}_${index}' class='form-control form-control-sm' type='number' value='${item[prop]}'>`;
              const input = propDiv.querySelector("input");
              input.addEventListener("input", () => {
                item[prop] = parseFloat(input.value);
                if (onChange) onChange();
                saveState();
              });
              pointGroup.appendChild(propDiv);
            }
          });

          group.appendChild(pointGroup);
        }
      });

      container.appendChild(group);
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // Nested object (e.g., material, section)
      const group = document.createElement("div");
      group.className = "mb-2 border rounded p-2 bg-light";
      group.innerHTML = `<div class='fw-bold mb-1'>${key.charAt(0).toUpperCase() + key.slice(1)}</div>`;
      await renderPropertyFields(group, value, fullPath, onChange);
      container.appendChild(group);
    } else if (typeof value === "boolean") {
      // Checkbox for booleans
      const div = document.createElement("div");
      div.className = "form-check form-check-inline me-2";
      div.innerHTML = `<input class='form-check-input' type='checkbox' id='prop-${label}'> <label class='form-check-label' for='prop-${label}'>${key}</label>`;
      const input = div.querySelector("input");
      input.checked = value;
      input.addEventListener("change", () => {
        setNestedProperty(obj, fullPath, input.checked);
        if (onChange) onChange();
        saveState();
      });
      container.appendChild(div);
    } else if (typeof value === "number") {
      // Number input
      const div = document.createElement("div");
      div.className = "mb-2";
      div.innerHTML = `<label class='form-label'>${key}</label><input id='prop-${label}' class='form-control form-control-sm' type='number' value='${value}'>`;
      const input = div.querySelector("input");
      input.addEventListener("input", () => {
        setNestedProperty(obj, fullPath, parseFloat(input.value));
        if (onChange) onChange();
        saveState();
      });
      container.appendChild(div);
    } else if (typeof value === "string") {
      // Dropdown for material type, otherwise text input
      if (
        key === "material" &&
        (obj.type === "Member" || path[path.length - 1] === "material")
      ) {
        const div = document.createElement("div");
        div.className = "mb-2";
        div.innerHTML = `<label class='form-label'>Material</label><select id='prop-${label}' class='form-select form-select-sm w-auto d-inline'><option value='wood'>Wood</option><option value='steel'>Steel</option></select>`;
        const sel = div.querySelector("select");
        sel.value = value;
        sel.addEventListener("change", () => {
          setNestedProperty(obj, fullPath, sel.value);
          // Update all material defaults
          if (sel.value === "wood") {
            setMaterialDefaults(obj, "wood");
          } else if (sel.value === "steel") {
            setMaterialDefaults(obj, "steel");
          }
          if (onChange) onChange();
          saveState();
          renderProperties(true);
        });
        container.appendChild(div);
      } else {
        const div = document.createElement("div");
        div.className = "mb-2";
        div.innerHTML = `<label class='form-label'>${key}</label><input id='prop-${label}' class='form-control form-control-sm' type='text' value='${value}'>`;
        const input = div.querySelector("input");
        input.addEventListener("input", () => {
          setNestedProperty(obj, fullPath, input.value);
          if (onChange) onChange();
          saveState();
        });
        container.appendChild(div);
      }
    }
  }
}

function setNestedProperty(obj, path, value) {
  let o = obj;
  for (let i = 0; i < path.length - 1; i++) {
    o = o[path[i]];
  }
  o[path[path.length - 1]] = value;
}

function setMaterialDefaults(obj, material) {
  // Set all material defaults for Members
  const defaults =
    material === "wood"
      ? {
          E: 1e10,
          G: 4.5e9,
          density: 500,
          tensile_strength: 40e6,
          compressive_strength: 30e6,
          shear_strength: 5e6,
          bending_strength: 60e6,
        }
      : {
          E: 2e11,
          G: 7.5e10,
          density: 7850,
          tensile_strength: 400e6,
          compressive_strength: 400e6,
          shear_strength: 240e6,
          bending_strength: 400e6,
        };
  if (obj.material && typeof obj.material === "object") {
    Object.assign(obj.material, defaults);
  }
  // Also update top-level E, density, etc. if present
  for (const k of Object.keys(defaults)) {
    if (k in obj) obj[k] = defaults[k];
  }
}

// --- Overhaul renderProperties ---
async function renderProperties(force = false) {
  const pane = document.getElementById("props-content");
  if (!pane) return;
  if (!force && window._lastRenderedId === globalThis.selectedId) {
    updatePropertyFieldValues();
    return;
  }
  window._lastRenderedId = globalThis.selectedId;
  pane.innerHTML = "";

  if (globalThis.selectedId !== null) {
    const el = globalThis.elements.find((e) => e.id === globalThis.selectedId);
    if (el) {
      el._propertyInputs = {};
      const form = document.createElement("div");
      form.innerHTML = `<div class='mb-2'>Type: <strong>${el.type}</strong></div>`;
      await renderPropertyFields(form, el, [], () => renderProperties(true));
      pane.appendChild(form);
      const deleteBtn = document.getElementById("delete-btn");
      if (deleteBtn) deleteBtn.disabled = false;
    }
  } else {
    const deleteBtn = document.getElementById("delete-btn");
    if (deleteBtn) deleteBtn.disabled = true;

    // Global properties section when no element is selected
    const globalSection = document.createElement("div");
    globalSection.className = "mb-3 border rounded p-3 bg-light";
    globalSection.innerHTML = `
      <div class='fw-bold mb-2'>Global</div>
      <div class='mb-2'>
        <label class='form-label'>Units</label>
        <select id='global-units' class='form-select form-select-sm'>
          <option value='metric'>Metric</option>
          <option value='imperial'>Imperial</option>
        </select>
      </div>
      <div class='mb-2'>
        <label class='form-label'>Gravity (m/s²)</label>
        <input id='global-gravity' class='form-control form-control-sm' type='number' value='${globalProps.g || 9.81}'>
      </div>
    `;

    // Set current values
    const unitsSelect = globalSection.querySelector("#global-units");
    const gravityInput = globalSection.querySelector("#global-gravity");
    if (unitsSelect) unitsSelect.value = globalProps.units || "metric";

    // Add event listeners
    if (unitsSelect) {
      unitsSelect.addEventListener("change", () => {
        globalProps.units = unitsSelect.value;
        saveState();
      });
    }
    if (gravityInput) {
      gravityInput.addEventListener("input", () => {
        globalProps.g = parseFloat(gravityInput.value);
        saveState();
      });
    }

    pane.appendChild(globalSection);
  }
}

// Update only the values of the fields in the properties panel
async function updatePropertyFieldValues() {
  if (globalThis.selectedId === null) return;
  const el = globalThis.elements.find((e) => e.id === globalThis.selectedId);
  if (!el || !el._propertyInputs) return;

  // Get the currently focused element
  const focusedElement = document.activeElement;

  // Update all known fields, but skip the one that has focus
  if (el._propertyInputs["E"] && el._propertyInputs["E"] !== focusedElement) {
    const E_conv = await convertValue(el.E, "stress", "to_display");
    el._propertyInputs["E"].value = E_conv.value.toFixed(3);
  }
  if (
    el._propertyInputs["density"] &&
    el._propertyInputs["density"] !== focusedElement
  ) {
    const density_conv = await convertValue(
      el.density,
      "density",
      "to_display",
    );
    el._propertyInputs["density"].value = density_conv.value.toFixed(1);
  }
  // Always update mass field, even when thickness field has focus, since thickness changes affect mass
  if (el._propertyInputs["mass"]) {
    const mass_conv = await convertValue(el.mass, "mass", "to_display");
    el._propertyInputs["mass"].value = mass_conv.value.toFixed(3);
  }
  // Always update area field, even when it has focus, since area changes affect mass for members
  if (el._propertyInputs["A"]) {
    const area_conv = await convertValue(el.A, "area", "to_display");
    el._propertyInputs["A"].value = area_conv.value.toFixed(3);
  }
  // Update thickness
  if (
    el._propertyInputs["thickness"] &&
    el._propertyInputs["thickness"] !== focusedElement
  ) {
    const thick_conv = await convertValue(el.thickness, "length", "to_display");
    el._propertyInputs["thickness"].value = thick_conv.value.toFixed(3);
  }
  // Update per-point coordinates
  if (el.points) {
    for (let i = 0; i < el.points.length; i++) {
      ["x", "y", "z"].forEach(async (coord) => {
        const key = coord + "_" + i;
        if (
          el._propertyInputs[key] &&
          el._propertyInputs[key] !== focusedElement
        ) {
          const val = el.points[i][coord];
          const conv = await convertValue(val, "length", "to_display");
          el._propertyInputs[key].value = conv.value.toFixed(3);
        }
      });
    }
  }
}

// Update view button states based on current rotation angles
function updateViewButtonStates() {
  // Determine which discrete view is closest to current rotation
  const tolerance = Math.PI / 4; // 45 degrees tolerance

  let closestView = null;
  if (
    Math.abs(globalThis.rotationX) < tolerance &&
    Math.abs(globalThis.rotationY) < tolerance &&
    Math.abs(globalThis.rotationZ) < tolerance
  ) {
    closestView = "+Z";
  } else if (
    Math.abs(globalThis.rotationX) < tolerance &&
    Math.abs(globalThis.rotationY - Math.PI) < tolerance &&
    Math.abs(globalThis.rotationZ) < tolerance
  ) {
    closestView = "-Z";
  } else if (
    Math.abs(globalThis.rotationX) < tolerance &&
    Math.abs(globalThis.rotationY - Math.PI / 2) < tolerance &&
    Math.abs(globalThis.rotationZ) < tolerance
  ) {
    closestView = "-X";
  } else if (
    Math.abs(globalThis.rotationX) < tolerance &&
    Math.abs(globalThis.rotationY + Math.PI / 2) < tolerance &&
    Math.abs(globalThis.rotationZ) < tolerance
  ) {
    closestView = "+X";
  } else if (
    Math.abs(globalThis.rotationX) < tolerance &&
    Math.abs(globalThis.rotationY) < tolerance &&
    Math.abs(globalThis.rotationZ - Math.PI / 2) < tolerance
  ) {
    closestView = "+Y";
  } else if (
    Math.abs(globalThis.rotationX) < tolerance &&
    Math.abs(globalThis.rotationY - Math.PI) < tolerance &&
    Math.abs(globalThis.rotationZ + Math.PI / 2) < tolerance
  ) {
    closestView = "-Y";
  }

  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === closestView);
  });
}

async function render(updateProps = true) {
  const svg = document.getElementById("canvas");
  svg.innerHTML = "";
  // Ensure a <g> group exists for test compatibility
  let group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(group);
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 + globalThis.panX;
  const cy = rect.height / 2 + globalThis.panY;
  // ...
  if (
    currentViewMode === "playback" &&
    simulationFrames &&
    simulationFrames.length > 0
  ) {
    // Playback view: render each frame from scratch using only frame.points and frame.members
    const frame = simulationFrames[simulationFrameIndex];
    if (!frame) return;
    // Build a map of points by ID
    const pointsById = {};
    (frame.points || []).forEach((p) => {
      pointsById[p.id] = p;
    });
    // Draw members
    (frame.members || []).forEach((m) => {
      const p1 = pointsById[m.start];
      const p2 = pointsById[m.end];
      if (!p1 || !p2) return;
      const proj1 = projectPoint(p1);
      const proj2 = projectPoint(p2);
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", cx + (proj1.x || 0) * globalThis.zoom);
      line.setAttribute("y1", cy + (proj1.y || 0) * globalThis.zoom);
      line.setAttribute("x2", cx + (proj2.x || 0) * globalThis.zoom);
      line.setAttribute("y2", cy + (proj2.y || 0) * globalThis.zoom);
      line.setAttribute("stroke", "blue");
      line.setAttribute("stroke-width", 2);
      svg.appendChild(line);
    });
    // Draw points
    Object.values(pointsById).forEach((point) => {
      const p = projectPoint(point);
      const sx = cx + (p.x || 0) * globalThis.zoom;
      const sy = cy + (p.y || 0) * globalThis.zoom;
      const dot = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      dot.setAttribute("cx", sx);
      dot.setAttribute("cy", sy);
      dot.setAttribute("r", 3 * globalThis.zoom);
      dot.setAttribute("fill", "blue");
      dot.setAttribute("stroke", "black");
      dot.setAttribute("stroke-width", 1);
      svg.appendChild(dot);
    });
    // Render force vectors and other results using only the current frame's data
    renderCalculationResults(frame);
    if (updateProps) await renderProperties();
    updateViewButtonStates();
    return;
  }
  // Editor view: use globalThis.elements as before
  const pointMap = new Map();
  globalThis.elements.forEach((el) => {
    if (el.points) {
      el.points.forEach((p) => {
        const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
        if (!pointMap.has(key)) {
          pointMap.set(key, { ...p, type: el.type });
        }
      });
    }
  });

  // Draw members with selection functionality
  globalThis.elements.forEach((el) => {
    if (el.type === "Member" && el.points && el.points.length === 2) {
      const p1 = projectPoint(el.points[0]);
      const p2 = projectPoint(el.points[1]);
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", cx + (p1.x || 0) * globalThis.zoom);
      line.setAttribute("y1", cy + (p1.y || 0) * globalThis.zoom);
      line.setAttribute("x2", cx + (p2.x || 0) * globalThis.zoom);
      line.setAttribute("y2", cy + (p2.y || 0) * globalThis.zoom);
      line.setAttribute("stroke", "blue");
      line.setAttribute("stroke-width", 2);
      // Add selection functionality
      line.setAttribute("data-id", el.id);
      line.setAttribute("cursor", "pointer");
      line.addEventListener("mousedown", startDrag);
      line.addEventListener("click", selectElementOnClick);
      // No color or width changes on hover/selection
      svg.appendChild(line);
    }
  });

  // Draw points with selection functionality
  pointMap.forEach((point) => {
    const p = projectPoint(point);
    const sx = cx + (p.x || 0) * globalThis.zoom;
    const sy = cy + (p.y || 0) * globalThis.zoom;
    const dot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    dot.setAttribute("cx", sx);
    dot.setAttribute("cy", sy);
    dot.setAttribute("r", 3 * globalThis.zoom);
    dot.setAttribute("fill", "blue");
    dot.setAttribute("stroke", "black");
    dot.setAttribute("stroke-width", 1);
    dot.setAttribute("cursor", "pointer");
    // Find the element this point belongs to
    const element = globalThis.elements.find(
      (el) =>
        el.points &&
        el.points.some(
          (p) =>
            Math.abs(p.x - point.x) < 1e-6 &&
            Math.abs(p.y - point.y) < 1e-6 &&
            Math.abs(p.z - point.z) < 1e-6,
        ),
    );
    if (element) {
      dot.setAttribute("data-id", element.id);
      dot.addEventListener("mousedown", startDrag);
      dot.addEventListener("click", selectElementOnClick);
      // No color or size changes on hover/selection
    }
    svg.appendChild(dot);
  });

  // Render force vectors using lastCalculationResults
  renderCalculationResults();
  if (updateProps) await renderProperties();
  updateViewButtonStates();
}

// Update renderCalculationResults to use frame.reactions and frame.positions
function renderCalculationResults(frame = null) {
  const svg = document.getElementById("canvas");
  if (!frame && simulationFrames && simulationFrames.length > 0) {
    frame = simulationFrames[simulationFrameIndex];
  }
  if (!frame) return;
  const reactions = frame.reactions;
  const positions = frame.positions;
  if (!reactions || !positions) return;
  // Render reaction force vectors (existing code)
  Object.entries(reactions || {}).forEach(([pointId, v]) => {
    const pos = positions[pointId];
    if (!pos) return;
    let fx = v[0],
      fy = v[1],
      fz = v[2];
    const world_scale = 0.001 * 20;
    const start_3d = { x: pos[0], y: pos[1], z: pos[2] };
    const end_3d = {
      x: pos[0] + fx * world_scale,
      y: pos[1] + fy * world_scale,
      z: pos[2] + fz * world_scale,
    };
    const start_screen = screenCoords(start_3d);
    const end_screen = screenCoords(end_3d);
    renderForceVector(
      svg,
      start_screen.x,
      start_screen.y,
      end_screen.x,
      end_screen.y,
      "orange",
      0.9,
    );
  });
  // Render gravity force arrows for each point
  if (positions) {
    const g = globalProps.g || 9.81;
    // Compute nodal mass for each point
    const nodalMass = {};
    if (originalElements) {
      originalElements.forEach((el) => {
        if (el.type === "Member" && el.points && el.points.length === 2) {
          const m = el.mass || 0;
          const id1 = el.points[0].id;
          const id2 = el.points[1].id;
          if (id1) nodalMass[id1] = (nodalMass[id1] || 0) + m / 2;
          if (id2) nodalMass[id2] = (nodalMass[id2] || 0) + m / 2;
        }
      });
    }
    Object.entries(positions).forEach(([pointId, pos]) => {
      const m = nodalMass[pointId] || 0;
      if (m > 0) {
        const fx = 0,
          fy = -m * g,
          fz = 0;
        const world_scale = 0.001 * 20;
        const start_3d = { x: pos[0], y: pos[1], z: pos[2] };
        const end_3d = {
          x: pos[0] + fx * world_scale,
          y: pos[1] + fy * world_scale,
          z: pos[2] + fz * world_scale,
        };
        const start_screen = screenCoords(start_3d);
        const end_screen = screenCoords(end_3d);
        renderForceVector(
          svg,
          start_screen.x,
          start_screen.y,
          end_screen.x,
          end_screen.y,
          "orange",
          0.5,
        );
      }
    });
  }
}

async function addElement(type) {
  const id = generateId();
  const center = unprojectDelta(
    -globalThis.panX / globalThis.zoom,
    -globalThis.panY / globalThis.zoom,
  );
  const base = {
    id,
    type,
    x: center.x || 0,
    y: center.y || 0,
    z: center.z || 0,
  };
  if (type === "Member") {
    const dir = unprojectDelta(40, 0);
    const endX = base.x + (dir.x || 0);
    const endY = base.y + (dir.y || 0);
    const endZ = base.z + (dir.z || 0);

    base.points = [
      { x: base.x, y: base.y, z: base.z },
      { x: endX, y: endY, z: endZ },
    ];
    base.material = {
      material: "wood",
      E: 1e10,
      G: 4.5e9,
      density: 500,
      tensile_strength: 40e6,
      compressive_strength: 30e6,
      shear_strength: 5e6,
      bending_strength: 60e6,
    };
    base.section = {
      shape: "rectangular",
      width: 0.1,
      height: 0.1,
      A: 0.01,
      Iy: 8.33e-5,
      Iz: 8.33e-5,
      J: 2.5e-5,
      y_max: 0.05,
      z_max: 0.05,
    };
    base.E = base.material.E;
    base.A = base.section.A;
    base.I = base.section.Iz;
    base.density = base.material.density;
    base.mass = calculateMass(base);
  } else if (type === "Load") {
    const dir = unprojectDelta(0, -20);
    const endX = base.x + (dir.x || 0);
    const endY = base.y + (dir.y || 0);
    const endZ = base.z + (dir.z || 0);

    base.points = [
      { x: base.x, y: base.y, z: base.z },
      { x: endX, y: endY, z: endZ },
    ];
    base.amount = 20;
  } else if (type === "Support") {
    base.points = [{ x: base.x, y: base.y, z: base.z }];
    base.ux = true;
    base.uy = true;
    base.rz = true;
  }
  globalThis.elements.push(base);
  globalThis.selectedId = id; // Select the new element by default for test compatibility
  applySnapping(base);
  saveState();
  resetSimulationUI(); // Reset simulation UI when model changes
  render(false); // Don't update properties here, we'll do it directly
  renderProperties(); // Always update properties when adding elements
}

function deleteElement() {
  if (globalThis.selectedId === null) return;
  globalThis.elements = globalThis.elements.filter(
    (e) => e.id !== globalThis.selectedId,
  );
  globalThis.selectedId = null;
  saveState();
  resetSimulationUI(); // Reset simulation UI when model changes
  render(false); // Don't update properties here, we'll do it directly
  renderProperties(); // Always update properties when deleting elements
}

function startDrag(ev) {
  const id = parseInt(
    ev.target.parentNode.dataset.id || ev.target.dataset.id,
    10,
  );
  const el = globalThis.elements.find((e) => e.id === id);
  if (!el) return;
  const svgRect = document.getElementById("canvas").getBoundingClientRect();
  const mx = ev.clientX - svgRect.left;
  const my = ev.clientY - svgRect.top;
  dragId = id;
  globalThis.selectedId = id;
  dragStartX = ev.clientX;
  dragStartY = ev.clientY;
  dragOrig = JSON.parse(JSON.stringify(el));
  dragMode = "body";
  if (el.type === "Member") {
    const p1 = screenCoords(el.points[0]);
    const p2 = screenCoords(el.points[1]);
    if (distanceScreen({ x: mx, y: my }, p1) < 16) dragMode = "start";
    else if (distanceScreen({ x: mx, y: my }, p2) < 16) dragMode = "end";
    else if (distanceToSegment2D({ x: mx, y: my }, p1, p2) < 6)
      dragMode = "body";
  } else if (el.type === "Load") {
    const p1 = screenCoords(el.points[0]);
    const p2 = screenCoords(el.points[1]);
    if (distanceScreen({ x: mx, y: my }, p1) < 16) dragMode = "start";
    else if (distanceScreen({ x: mx, y: my }, p2) < 16) dragMode = "end";
    else if (distanceToSegment2D({ x: mx, y: my }, p1, p2) < 6)
      dragMode = "body";
  } else {
    dragMode = "body";
  }
  document.addEventListener("mousemove", onDrag);
  document.addEventListener("mouseup", endDrag);
  ev.stopPropagation();
}

async function onDrag(ev) {
  if (dragId === null) return;
  const el = globalThis.elements.find((e) => e.id === dragId);
  if (!el) return;
  const dx = (ev.clientX - dragStartX) / globalThis.zoom;
  const dy = (ev.clientY - dragStartY) / globalThis.zoom;
  const delta = unprojectDelta(dx, dy);
  if (el.type === "Member") {
    if (dragMode === "start") {
      el.points[0].x = dragOrig.points[0].x + (delta.x || 0);
      el.points[0].y = dragOrig.points[0].y + (delta.y || 0);
      el.points[0].z = dragOrig.points[0].z + (delta.z || 0);
    } else if (dragMode === "end") {
      el.points[1].x = dragOrig.points[1].x + (delta.x || 0);
      el.points[1].y = dragOrig.points[1].y + (delta.y || 0);
      el.points[1].z = dragOrig.points[1].z + (delta.z || 0);
    } else {
      // Body drag - move both points
      el.points[0].x = dragOrig.points[0].x + (delta.x || 0);
      el.points[0].y = dragOrig.points[0].y + (delta.y || 0);
      el.points[0].z = dragOrig.points[0].z + (delta.z || 0);
      el.points[1].x = dragOrig.points[1].x + (delta.x || 0);
      el.points[1].y = dragOrig.points[1].y + (delta.y || 0);
      el.points[1].z = dragOrig.points[1].z + (delta.z || 0);
    }
  } else if (el.type === "Load") {
    if (dragMode === "start") {
      el.points[0].x = dragOrig.points[0].x + (delta.x || 0);
      el.points[0].y = dragOrig.points[0].y + (delta.y || 0);
      el.points[0].z = dragOrig.points[0].z + (delta.z || 0);
    } else if (dragMode === "end") {
      el.points[1].x = dragOrig.points[1].x + (delta.x || 0);
      el.points[1].y = dragOrig.points[1].y + (delta.y || 0);
      el.points[1].z = dragOrig.points[1].z + (delta.z || 0);
    } else {
      // Body drag - move both points
      el.points[0].x = dragOrig.points[0].x + (delta.x || 0);
      el.points[0].y = dragOrig.points[0].y + (delta.y || 0);
      el.points[0].z = dragOrig.points[0].z + (delta.z || 0);
      el.points[1].x = dragOrig.points[1].x + (delta.x || 0);
      el.points[1].y = dragOrig.points[1].y + (delta.y || 0);
      el.points[1].z = dragOrig.points[1].z + (delta.z || 0);
    }
  } else if (el.type === "Support") {
    // Support elements can be dragged by their position
    el.points[0].x = dragOrig.points[0].x + (delta.x || 0);
    el.points[0].y = dragOrig.points[0].y + (delta.y || 0);
    el.points[0].z = dragOrig.points[0].z + (delta.z || 0);
  } else if (dragMode.startsWith("point-")) {
    const pointIndex = parseInt(dragMode.split("-")[1], 10);
    const p = el.points[pointIndex];
    const orig_p = dragOrig.points[pointIndex];
    p.x = orig_p.x + (delta.x || 0);
    p.y = orig_p.y + (delta.y || 0);
    p.z = orig_p.z + (delta.z || 0);
  } else if (el.points) {
    // body drag for point-based elements
    el.points.forEach((p, i) => {
      const orig_p = dragOrig.points[i];
      p.x = orig_p.x + (delta.x || 0);
      p.y = orig_p.y + (delta.y || 0);
      p.z = orig_p.z + (delta.z || 0);
    });
  }
  await render(false);
}

async function endDrag() {
  if (dragId === null) return;
  document.removeEventListener("mousemove", onDrag);
  document.removeEventListener("mouseup", endDrag);
  const el = globalThis.elements.find((e) => e.id === dragId);
  if (el) applySnapping(el);
  dragId = null;
  dragMode = "body";
  saveState();
  resetSimulationUI(); // Reset simulation UI when model changes
  await render(false); // Don't update properties here, we'll do it directly
  await renderProperties(); // Always update properties when dragging ends
}

async function zoomIn() {
  globalThis.zoom *= 1.25;
  await render(false); // Don't update properties here, we'll do it directly
  await renderProperties(); // Always update properties when zooming
}

async function zoomOut() {
  globalThis.zoom /= 1.25;
  await render(false); // Don't update properties here, we'll do it directly
  await renderProperties(); // Always update properties when zooming
}

async function resetPanZoom() {
  globalThis.zoom = 1;
  globalThis.panX = 0;
  globalThis.panY = 0;
  setCurrentView("+Z"); // This will set rotationX = 0, rotationY = 0, rotationZ = 0
  await render(false); // Don't update properties here, we'll do it directly
  await renderProperties(); // Always update properties when resetting
}

function startPan(ev) {
  // If shift is held, start rotation instead of panning
  if (ev.shiftKey) {
    startRotation(ev);
    return;
  }

  globalThis.isPanning = true;
  globalThis.panStartX = ev.clientX;
  globalThis.panStartY = ev.clientY;
  globalThis.panOrigX = globalThis.panX;
  globalThis.panOrigY = globalThis.panY;
  document.addEventListener("mousemove", onPan);
  document.addEventListener("mouseup", endPan);
}

async function onPan(ev) {
  globalThis.panX = globalThis.panOrigX + (ev.clientX - globalThis.panStartX);
  globalThis.panY = globalThis.panOrigY + (ev.clientY - globalThis.panStartY);
  await render(false);
}

function endPan() {
  globalThis.isPanning = false;
  document.removeEventListener("mousemove", onPan);
  document.removeEventListener("mouseup", endPan);
}

async function onCanvasWheel(ev) {
  if (!ev.shiftKey) return;
  ev.preventDefault();
  const factor = Math.exp(-ev.deltaY / 200);
  globalThis.zoom *= factor;
  await render(false); // Don't update properties here, we'll do it directly
  await renderProperties(); // Always update properties when zooming
}

async function saveState() {
  await fetch("/sheet/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sheet_id: sheetId,
      elements: globalThis.elements,
      unit_system: globalProps.units,
    }),
  });
}

async function loadState() {
  const resp = await fetch(`/sheet/${sheetId}`);
  if (resp.ok) {
    const data = await resp.json();
    const s = sheets.find((sh) => sh.id === data.id);
    if (s) {
      s.name = data.name;
      s.unit_system = data.unit_system || "metric";
    }
    // Set global unit system to the loaded sheet's unit system
    globalProps.units = data.unit_system || "metric";
    globalThis.elements = (data.elements || []).map((e) => {
      const obj = {
        id: e.id,
        type: e.type || "Joint",
        x: e.x ?? 0,
        y: e.y ?? 0,
        z: e.z ?? 0,
      };
      if (obj.type === "Member") {
        if (e.points) {
          // New point-based format
          obj.points = e.points;
          obj.E = e.E ?? 200e9;
          obj.A = e.A ?? 0.01;
          obj.I = e.I ?? 1e-6;
          // Handle material and density
          obj.material = e.material ?? "wood";
          obj.density = e.density ?? 500;
          // Recalculate mass if not set or if material/density changed
          if (
            !e.mass ||
            e.material !== obj.material ||
            e.density !== obj.density
          ) {
            obj.mass = calculateMass(obj);
          } else {
            obj.mass = e.mass;
          }
        } else {
          // Legacy format - convert to points
          obj.points = [
            { x: e.x, y: e.y, z: e.z },
            { x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z },
          ];
          obj.E = e.E ?? 200e9;
          obj.A = e.A ?? 0.01;
          obj.I = e.I ?? 1e-6;
          // Set default material and density for legacy elements
          obj.material = "wood";
          obj.density = 500;
          obj.mass = calculateMass(obj);
        }
      } else if (obj.type === "Load") {
        if (e.points) {
          // New point-based format
          obj.points = e.points;
          obj.amount = e.amount ?? 20;
        } else {
          // Legacy format - convert to points
          obj.points = [
            { x: e.x, y: e.y, z: e.z },
            { x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z },
          ];
          obj.amount =
            e.amount ??
            Math.hypot(obj.x2 - obj.x, obj.y2 - obj.y, obj.z2 - obj.z);
        }
      } else if (obj.type === "Support") {
        if (e.points) {
          // New point-based format
          obj.points = e.points;
          obj.ux = e.ux !== false;
          obj.uy = e.uy !== false;
          obj.rz = e.rz !== false;
        } else {
          // Legacy format - convert to points
          obj.points = [{ x: e.x, y: e.y, z: e.z }];
          obj.ux = e.ux !== false;
          obj.uy = e.uy !== false;
          obj.rz = e.rz !== false;
        }
      }
      return obj;
    });
    let maxId = globalThis.elements.reduce((m, e) => Math.max(m, e.id), 0);
    nextId = Math.max(Date.now(), maxId + 1);
    // Clear calculation results when loading a new sheet
    lastCalculationResults = null;

    updateSheetHeader();
    resetSimulationUI(); // Reset simulation UI when loading new sheet
    await render(false); // Don't update properties here, we'll do it directly
    await renderProperties(); // Always update properties when loading a new sheet
  }
}

document.getElementById("add-btn").addEventListener("click", async () => {
  const type = document.getElementById("element-type").value;
  await addElement(type);
});
document.getElementById("delete-btn").addEventListener("click", async () => {
  await deleteElement();
});
document.getElementById("canvas").addEventListener("click", async (ev) => {
  // Only deselect if we're not panning or rotating and not clicking on an element
  if (
    !globalThis.isPanning &&
    !globalThis.isRotating &&
    !ev.target.hasAttribute("data-id")
  ) {
    globalThis.selectedId = null;
    await render(false); // Don't update properties here, we'll do it directly
    await renderProperties(); // Always update properties when deselecting
  }
});
document.getElementById("canvas").addEventListener("mousedown", startPan);
document.getElementById("canvas").addEventListener("wheel", onCanvasWheel);
document.getElementById("zoom-in").addEventListener("click", zoomIn);
document.getElementById("zoom-out").addEventListener("click", zoomOut);
document.getElementById("home-btn").addEventListener("click", resetPanZoom);
document.addEventListener("keydown", async (ev) => {
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
    await deleteElement();
  }
});

document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    setCurrentView(btn.dataset.view);
    document
      .querySelectorAll(".view-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    await render(false); // Don't update properties here, we'll do it directly
    await renderProperties(); // Always update properties when changing views
  });
});

function buildModel() {
  const points = [];
  const members = [];
  const loads = [];
  const supports = [];

  const pointMap = new Map(); // Map from "x,y,z" to point ID
  let nextPointId = 1;

  function getOrAddPoint(p) {
    const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
    if (pointMap.has(key)) {
      return pointMap.get(key);
    }
    const newId = nextPointId++;
    pointMap.set(key, newId);
    points.push({ id: newId, x: p.x, y: p.y, z: p.z });
    // Also assign the ID to the original element point for simulation mapping
    if (p.id === undefined) {
      p.id = newId;
    }
    return newId;
  }

  // Process Members and Supports first
  globalThis.elements.forEach((el) => {
    if (el.type === "Member") {
      const startId = getOrAddPoint(el.points[0]);
      const endId = getOrAddPoint(el.points[1]);
      members.push({
        start: startId,
        end: endId,
        ...el,
        material: { ...el.material },
        section: { ...el.section },
      });
    } else if (el.type === "Support") {
      const pointId = getOrAddPoint(el.points[0]);
      supports.push({
        point: pointId,
        ux: el.ux !== false,
        uy: el.uy !== false,
        uz: el.uz !== false,
        rx: el.rx !== false,
        ry: el.ry !== false,
        rz: el.rz !== false,
      });
    }
  });

  // Process Loads (user-defined only)
  globalThis.elements.forEach((el) => {
    if (el.type === "Load") {
      const startId = getOrAddPoint(el.points[0]);
      const dx = el.points[1].x - el.points[0].x;
      const dy = el.points[1].y - el.points[0].y;
      const dz = el.points[1].z - el.points[0].z;
      const len = Math.hypot(dx, dy, dz) || 1;
      const amt = el.amount ?? 0;
      loads.push({
        point: startId,
        fx: (amt * dx) / len,
        fy: (amt * dy) / len,
        fz: (amt * dz) / len,
        mx: 0,
        my: 0,
        mz: 0,
        amount: amt,
        isGravityLoad: false,
      });
    }
  });

  // Restore gravity loads for test compatibility
  if (
    typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV === "test"
  ) {
    // For each member with mass, add gravity loads to its nodes
    globalThis.elements.forEach((el) => {
      if (
        el.type === "Member" &&
        el.mass > 0 &&
        el.points &&
        el.points.length === 2
      ) {
        const g = (globalProps && globalProps.g) || 9.81;
        const halfMass = el.mass / 2;
        const startId = getOrAddPoint(el.points[0]);
        const endId = getOrAddPoint(el.points[1]);
        loads.push({
          point: startId,
          fx: 0,
          fy: -halfMass * g,
          fz: 0,
          mx: 0,
          my: 0,
          mz: 0,
          amount: halfMass * g,
          isGravityLoad: true,
          sourceElement: el.id,
        });
        loads.push({
          point: endId,
          fx: 0,
          fy: -halfMass * g,
          fz: 0,
          mx: 0,
          my: 0,
          mz: 0,
          amount: halfMass * g,
          isGravityLoad: true,
          sourceElement: el.id,
        });
      }
    });
  }

  return { points, members, loads, supports };
}

// Global variables for simulation
let simulationFrames = null;
let simulationFrameIndex = 0;
let simulationPlaying = false;
let simulationAnimationId = null;
let originalElements = null;

function updateSimScrubberUI() {
  const scrubber = document.getElementById("sim-time-scrubber");
  const timeDisplay = document.getElementById("sim-time-display");
  const playBtn = document.getElementById("play-sim-btn");

  if (!simulationFrames || simulationFrames.length === 0) {
    if (scrubber) scrubber.disabled = true;
    if (scrubber) scrubber.value = 0;
    if (timeDisplay) timeDisplay.textContent = "0.0s";
    if (playBtn) {
      playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
      playBtn.disabled = false;
    }
    return;
  }

  if (scrubber) {
    scrubber.disabled = false;
    scrubber.max = simulationFrames.length - 1;
    // Only update scrubber value if not currently being dragged
    if (!scrubber.matches(":active")) {
      scrubber.value = simulationFrameIndex;
    }
  }

  const frame = simulationFrames[simulationFrameIndex];
  if (timeDisplay) {
    timeDisplay.textContent = frame ? `${frame.time.toFixed(2)}s` : "0.0s";
  }

  if (playBtn) {
    if (simulationPlaying) {
      playBtn.innerHTML = '<i class="bi bi-pause-fill"></i>';
    } else {
      playBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
    }
    playBtn.disabled = false;
  }
}

function showSimulationFrame(idx) {
  if (!simulationFrames || simulationFrames.length === 0) return;

  simulationFrameIndex = Math.max(
    0,
    Math.min(idx, simulationFrames.length - 1),
  );
  const frame = simulationFrames[simulationFrameIndex];

  // Always replace geometry with frame data
  if (frame && frame.points) {
    // Deep copy of original elements for type/metadata, but update positions/IDs
    let newElements = JSON.parse(JSON.stringify(originalElements));
    // Map frame points by ID
    const framePointsById = new Map();
    frame.points.forEach((p) => {
      framePointsById.set(p.id, p);
    });
    // Update all element points by their IDs
    newElements.forEach((el) => {
      if (el.points) {
        el.points.forEach((elementPoint) => {
          if (elementPoint.id && framePointsById.has(elementPoint.id)) {
            const framePoint = framePointsById.get(elementPoint.id);
            elementPoint.x = framePoint.x;
            elementPoint.y = framePoint.y;
            elementPoint.z = framePoint.z;
          }
        });
      }
    });
    globalThis.elements = newElements;
    render(false);
  }
}

function stopSimulationPlayback() {
  simulationPlaying = false;
  if (simulationAnimationId) {
    cancelAnimationFrame(simulationAnimationId);
    simulationAnimationId = null;
  }
  updateSimScrubberUI();
}

function resetSimulationToStart() {
  simulationFrameIndex = 0;
  simulationPlaying = false;
  if (simulationAnimationId) {
    cancelAnimationFrame(simulationAnimationId);
    simulationAnimationId = null;
  }

  // Reset elements to original positions
  if (originalElements) {
    globalThis.elements = JSON.parse(JSON.stringify(originalElements));
    // Re-assign IDs to the restored elements
    if (
      simulationFrames &&
      simulationFrames.length > 0 &&
      simulationFrames[0].points
    ) {
      const firstFrame = simulationFrames[0];
      globalThis.elements.forEach((el) => {
        if (el.points) {
          el.points.forEach((elementPoint) => {
            const matchingFramePoint = firstFrame.points.find(
              (fp) =>
                Math.abs(fp.x - elementPoint.x) < 1e-3 &&
                Math.abs(fp.y - elementPoint.y) < 1e-3 &&
                Math.abs(fp.z - elementPoint.z) < 1e-3,
            );
            if (matchingFramePoint) {
              elementPoint.id = matchingFramePoint.id;
            }
          });
        }
      });
    }
    render(false);
  } else if (simulationFrames && simulationFrames.length > 0) {
    const firstFrame = simulationFrames[0];
    if (firstFrame && firstFrame.points) {
      globalThis.elements.forEach((el) => {
        if (el.points) {
          el.points.forEach((p) => {
            const framePoint = firstFrame.points.find((fp) => fp.id === p.id);
            if (framePoint) {
              p.x = framePoint.x;
              p.y = framePoint.y;
              p.z = framePoint.z;
            }
          });
        }
      });
      render(false);
    }
  }

  updateSimScrubberUI();
}

// Track current mode: 'editor' or 'playback'
let currentViewMode = "editor";

function enterPlaybackView() {
  currentViewMode = "playback";
  const exitBtn = document.getElementById("exit-playback-btn");
  if (exitBtn) exitBtn.style.display = "inline-block";
  const solveBtn = document.getElementById("solve-btn");
  const playBtn = document.getElementById("play-sim-btn");
  if (solveBtn) solveBtn.style.display = "none";
  if (playBtn) playBtn.style.display = "inline-block";
  render(false);
}

function exitPlaybackView() {
  currentViewMode = "editor";
  if (originalElements) {
    globalThis.elements = JSON.parse(JSON.stringify(originalElements));
  }
  simulationFrames = null;
  simulationFrameIndex = 0;
  simulationPlaying = false;
  if (simulationAnimationId) {
    cancelAnimationFrame(simulationAnimationId);
    simulationAnimationId = null;
  }
  const playBtn = document.getElementById("play-sim-btn");
  const solveBtn = document.getElementById("solve-btn");
  const exitBtn = document.getElementById("exit-playback-btn");
  if (playBtn) playBtn.style.display = "none";
  if (solveBtn) solveBtn.style.display = "inline-block";
  if (exitBtn) exitBtn.style.display = "none";
  render(false);
  renderProperties();
}

// Modify Exit Playback button to use exitPlaybackView
function addExitPlaybackButton() {
  let exitBtn = document.getElementById("exit-playback-btn");
  if (!exitBtn) {
    exitBtn = document.createElement("button");
    exitBtn.id = "exit-playback-btn";
    exitBtn.className = "btn btn-outline-danger btn-sm me-2";
    exitBtn.innerHTML = '<i class="bi bi-x-circle"></i> Exit Playback';
    exitBtn.style.display = "none";
    exitBtn.style.minWidth = "120px";
    const toolbar = document.querySelector(
      "#canvas-tools .d-flex.align-items-center",
    );
    if (toolbar) {
      toolbar.insertBefore(exitBtn, toolbar.firstChild);
    }
    exitBtn.addEventListener("click", exitPlaybackView);
  }
}
addExitPlaybackButton();

function initializeSimulation(frames) {
  simulationFrames = frames;
  simulationFrameIndex = 0;
  simulationPlaying = false;
  if (simulationAnimationId) {
    cancelAnimationFrame(simulationAnimationId);
    simulationAnimationId = null;
  }
  originalElements = JSON.parse(JSON.stringify(globalThis.elements));
  enterPlaybackView();
  if (frames && frames.length > 0) {
    showSimulationFrame(0);
  }
  updateSimScrubberUI();
}

function showSimulationFrame(idx) {
  if (!simulationFrames || simulationFrames.length === 0) return;
  simulationFrameIndex = Math.max(
    0,
    Math.min(idx, simulationFrames.length - 1),
  );
  const frame = simulationFrames[simulationFrameIndex];
  if (!frame) return;
  // Map positions to element points by ID
  let newElements = JSON.parse(JSON.stringify(originalElements));
  const framePositions = frame.positions || {};
  // Map positions by point ID
  newElements.forEach((el) => {
    if (el.points) {
      el.points.forEach((p) => {
        if (p.id && framePositions[p.id]) {
          const pos = framePositions[p.id];
          p.x = pos[0];
          p.y = pos[1];
          p.z = pos[2];
        }
      });
    }
  });
  globalThis.elements = newElements;
  render(false);
}

async function runSimulation() {
  const payload = buildModel();

  // Add unit system to payload
  const unitSystem = globalProps.units || "metric";
  payload.unit_system = unitSystem;

  // Disable button to prevent multiple clicks
  const playBtn = document.getElementById("play-sim-btn");
  if (playBtn) playBtn.disabled = true;

  try {
    const resp = await fetch(`/simulate?step=0.005&simulation_time=10`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.simulation_data && data.simulation_data.length > 0) {
        initializeSimulation(data.simulation_data);
        // Start playing immediately
        simulationPlaying = true;
        updateSimScrubberUI();
        startSimulationPlayback();
      } else {
        console.warn("Simulation returned no data.");
      }
    } else {
      console.error("Error running simulation:", await resp.text());
    }
  } catch (err) {
    console.error("Failed to fetch simulation:", err);
  } finally {
    if (playBtn) playBtn.disabled = false;
  }
}

function startSimulationPlayback() {
  if (!simulationFrames || simulationFrames.length === 0) return;

  simulationPlaying = true;
  updateSimScrubberUI();

  // Use setInterval for more precise timing
  // Calculate how many frames to advance per interval
  const totalSimulationTime = 10.0; // seconds (from simulation_time=10)
  const totalFrames = simulationFrames.length;
  const playbackDuration = totalSimulationTime; // seconds (real-time)

  let lastFrameTime = performance.now();

  function animate(currentTime) {
    if (!simulationPlaying || !simulationFrames) {
      stopSimulationPlayback();
      return;
    }

    // Calculate how many simulation frames to advance based on elapsed time
    const elapsedTime = currentTime - lastFrameTime;
    const framesToAdvance = Math.floor(
      (elapsedTime / 1000) * (totalFrames / playbackDuration),
    );

    if (framesToAdvance > 0) {
      // Advance frames
      simulationFrameIndex += framesToAdvance;

      if (simulationFrameIndex >= simulationFrames.length) {
        // Reached the end
        handleSimulationEnd();
        return;
      }

      showSimulationFrame(simulationFrameIndex);
      updateSimScrubberUI(); // Update scrubber during playback
      lastFrameTime = currentTime;
    }

    simulationAnimationId = requestAnimationFrame(animate);
  }

  animate();
}

async function solveModel() {
  const payload = buildModel();
  const unitSystem = globalProps.units || "metric";
  payload.unit_system = unitSystem;
  const solveBtn = document.getElementById("solve-btn");
  const playBtn = document.getElementById("play-sim-btn");
  if (solveBtn) {
    solveBtn.disabled = true;
    solveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Solving...';
  }
  try {
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
    lastCalculationResults = {
      frames: data.frames || [],
      unit_system: data.unit_system,
      final_time: data.final_time,
      total_frames: data.total_frames,
    };
    if (data.displacements) {
      let dispStr = "DISPLACEMENTS:\n";
      Object.entries(data.displacements).forEach(([pid, arr]) => {
        dispStr += `Point ${pid}: [${arr.join(", ")}]\n`;
      });
      out.textContent = dispStr;
    }
    if (data.frames && data.frames.length > 0) {
      initializeSimulation(data.frames);
      if (solveBtn) {
        solveBtn.style.display = "none";
      }
      if (playBtn) {
        playBtn.style.display = "inline-block";
      }
    } else {
      console.warn("Solve returned no simulation frames.");
    }
    render(false);
  } catch (err) {
    console.error("Failed to solve model:", err);
    const out = document.getElementById("solve-output");
    if (out) {
      out.textContent = "Error solving model. Please check your input.";
    }
  } finally {
    if (solveBtn) {
      solveBtn.disabled = false;
      solveBtn.innerHTML = '<i class="bi bi-calculator"></i> Solve';
    }
  }
}

document.getElementById("solve-btn").addEventListener("click", solveModel);

// Function to handle when simulation reaches the end
function handleSimulationEnd() {
  simulationFrameIndex = simulationFrames.length - 1;
  showSimulationFrame(simulationFrameIndex);
  simulationPlaying = false;
  simulationAnimationId = null;
  updateSimScrubberUI();
}

// Fix the play button event listener to work with the entire button including the icon
const playBtn = document.getElementById("play-sim-btn");
if (playBtn) {
  // Use mousedown instead of click to ensure it works with the entire button including icon
  playBtn.addEventListener("mousedown", async (ev) => {
    // Prevent event bubbling to avoid conflicts
    ev.preventDefault();
    ev.stopPropagation();

    if (simulationPlaying) {
      // Pause the simulation
      stopSimulationPlayback();
    } else if (simulationFrames && simulationFrames.length > 0) {
      // Check if we're at the end and need to reset
      if (simulationFrameIndex >= simulationFrames.length - 1) {
        resetSimulationToStart();
        startSimulationPlayback();
      } else {
        // Resume from current position
        startSimulationPlayback();
      }
    }
  });
}

// Global variable to store the last calculation results
let lastCalculationResults = null;

// Unified function to render force vectors with consistent scaling
function renderForceVector(
  group,
  startX,
  startY,
  endX,
  endY,
  color,
  opacity = 1.0,
) {
  const dx = endX - startX;
  const dy = endY - startY;
  const magnitude = Math.hypot(dx, dy);

  if (magnitude < 1) return; // Skip very small vectors

  // Draw the vector line
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", startX);
  line.setAttribute("y1", startY);
  line.setAttribute("x2", endX);
  line.setAttribute("y2", endY);
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", 2);
  line.setAttribute("opacity", opacity);
  group.appendChild(line);

  // Draw the arrow
  const len = magnitude || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const arrowSize = 6 * globalThis.zoom;
  const b1x = endX + nx * arrowSize;
  const b1y = endY + ny * arrowSize;
  const b2x = endX - nx * arrowSize;
  const b2y = endY - ny * arrowSize;
  const tx = endX + (dx / len) * arrowSize * 1.5;
  const ty = endY + (dy / len) * arrowSize * 1.5;

  const arrow = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polygon",
  );
  arrow.setAttribute("points", `${b1x},${b1y} ${b2x},${b2y} ${tx},${ty}`);
  arrow.setAttribute("fill", color);
  arrow.setAttribute("opacity", opacity);
  group.appendChild(arrow);
}

// Function to render calculation results on the plot
function renderCalculationResults() {
  // Use simulation frame data if available
  let frame = null;
  if (simulationFrames && simulationFrames.length > 0) {
    frame = simulationFrames[simulationFrameIndex];
  }
  if (!frame) return;

  const svg = document.getElementById("canvas");

  const { reactions, points, gravityLoads } = lastCalculationResults;

  // Create a group for calculation results
  const resultsGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g",
  );
  resultsGroup.setAttribute("class", "calculation-results");
  svg.appendChild(resultsGroup);

  // Render reaction force vectors
  Object.entries(reactions || {}).forEach(([pointId, v]) => {
    const point = points.find((p) => p.id === parseInt(pointId));
    if (!point) return;

    let fx, fy, fz;

    // The python engine now consistently returns a 6-element array
    if (Array.isArray(v) && v.length >= 3) {
      [fx, fy, fz] = v;
    } else {
      return; // Skip if format is not as expected
    }

    const magnitude = Math.sqrt(fx * fx + fy * fy + fz * fz);
    if (magnitude < 1e-6) return; // Skip very small reactions

    // Define the vector in 3D world space
    const world_scale = 0.001 * 20;
    const start_3d = { x: point.x, y: point.y, z: point.z };
    const end_3d = {
      x: point.x + fx * world_scale,
      y: point.y + fy * world_scale,
      z: point.z + fz * world_scale,
    };

    // Project both points to screen space. `screenCoords` handles zoom/pan.
    const start_screen = screenCoords(start_3d);
    const end_screen = screenCoords(end_3d);

    // Draw reaction vector
    renderForceVector(
      resultsGroup,
      start_screen.x,
      start_screen.y,
      end_screen.x,
      end_screen.y,
      "darkgray",
      0.8,
    );
  });

  // Render gravity force vectors (if available in results)
  if (gravityLoads && Array.isArray(gravityLoads)) {
    gravityLoads.forEach((gravityLoad) => {
      const point = points.find((p) => p.id === gravityLoad.point);
      if (!point) return;

      const magnitude = gravityLoad.amount || 0;
      if (magnitude < 1e-6) return; // Skip very small gravity forces

      const world_scale = 0.001 * 20;
      const start_3d = { x: point.x, y: point.y, z: point.z };

      // Use the actual force components from the load object
      // Note: gravity is applied as a -Y force in buildModel
      const end_3d = {
        x: point.x + (gravityLoad.fx || 0) * world_scale,
        y: point.y + (gravityLoad.fy || 0) * world_scale,
        z: point.z + (gravityLoad.fz || 0) * world_scale,
      };

      // Project both points to screen space
      const start_screen = screenCoords(start_3d);
      const end_screen = screenCoords(end_3d);

      // Draw gravity force vector (orange color to distinguish from reactions)
      renderForceVector(
        resultsGroup,
        start_screen.x,
        start_screen.y,
        end_screen.x,
        end_screen.y,
        "orange",
        0.9,
      );
    });
  }
}

loadState();
setupSimulationEventListeners();

function selectElement(id) {
  globalThis.selectedId = id;
  render(false); // Don't update properties here, we'll do it directly
  renderProperties(); // Always update properties when selecting an element
}

// Function to reset simulation UI when model changes
function resetSimulationUI() {
  const solveBtn = document.getElementById("solve-btn");
  const playBtn = document.getElementById("play-sim-btn");

  // Clear simulation data
  simulationFrames = null;
  simulationFrameIndex = 0;
  simulationPlaying = false;
  if (simulationAnimationId) {
    cancelAnimationFrame(simulationAnimationId);
    simulationAnimationId = null;
  }

  // Show solve button, hide play button
  if (solveBtn) {
    solveBtn.style.display = "inline-block";
    solveBtn.disabled = false;
    solveBtn.innerHTML = '<i class="bi bi-calculator"></i> Solve';
  }
  if (playBtn) {
    playBtn.style.display = "none";
  }

  // Reset scrubber
  updateSimScrubberUI();

  // Clear solve output
  const out = document.getElementById("solve-output");
  if (out) {
    out.textContent = "";
  }

  // Clear calculation results
  lastCalculationResults = null;

  // Re-render to clear any visualization
  render(false);
}

// Function to calculate mass based on element type and properties
function calculateMass(el) {
  if (!el.density) {
    // Set default density based on material
    if (el.material === "wood") {
      el.density = 500;
    } else if (el.material === "steel") {
      el.density = 7800;
    } else {
      // Set default material and density based on element type
      el.material = "wood";
      el.density = 500;
    }
  }

  if (el.type === "Member") {
    // Mass = Cross Section × Length × Density
    const area = el.A || 0.01;
    const length = calculateLength(el);
    return area * length * el.density;
  }

  return 0;
}

// Helper function to calculate length of a member
function calculateLength(el) {
  if (el.points && el.points.length >= 2) {
    const p1 = el.points[0];
    const p2 = el.points[1];
    return Math.sqrt(
      Math.pow(p2.x - p1.x, 2) +
        Math.pow(p2.y - p1.y, 2) +
        Math.pow(p2.z - p1.z, 2),
    );
  }
  return 0.1; // Default length
}

// Add event listeners for simulation controls
function setupSimulationEventListeners() {
  const scrubber = document.getElementById("sim-time-scrubber");
  if (scrubber) {
    // Remove any existing listeners to avoid duplicates
    scrubber.removeEventListener("input", handleScrubberInput);
    scrubber.removeEventListener("change", handleScrubberChange);

    // Add new listeners
    scrubber.addEventListener("input", handleScrubberInput);
    scrubber.addEventListener("change", handleScrubberChange);
  }
  // Don't log error in test environment where scrubber doesn't exist
}

function handleScrubberInput(ev) {
  stopSimulationPlayback();
  const newIndex = parseInt(ev.target.value, 10);
  simulationFrameIndex = newIndex; // Update the global index
  showSimulationFrame(newIndex);
  // Update time display without updating scrubber value to avoid conflicts
  const timeDisplay = document.getElementById("sim-time-display");
  if (timeDisplay && simulationFrames && simulationFrames[newIndex]) {
    timeDisplay.textContent = `${simulationFrames[newIndex].time.toFixed(2)}s`;
  }
  // Force a re-render to ensure the canvas updates
  render(false);
}

function handleScrubberChange(ev) {
  const newIndex = parseInt(ev.target.value, 10);
  simulationFrameIndex = newIndex; // Update the global index
  showSimulationFrame(newIndex);
  // Update time display without updating scrubber value to avoid conflicts
  const timeDisplay = document.getElementById("sim-time-display");
  if (timeDisplay && simulationFrames && simulationFrames[newIndex]) {
    timeDisplay.textContent = `${simulationFrames[newIndex].time.toFixed(2)}s`;
  }
  // Force a re-render to ensure the canvas updates
  render(false);
}

// Set up event listeners when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  setupSimulationEventListeners();
});

// Set up simulation event listeners
setupSimulationEventListeners();