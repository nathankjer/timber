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
  const unitSystem = (typeof global !== 'undefined' && global.globalProps && global.globalProps.units) ? global.globalProps.units : (globalProps.units || "metric");

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
    z: 0
  };
  
  // Apply inverse rotation (transpose of rotation matrix for orthogonal matrices)
  const invMatrix = [
    [matrix[0][0], matrix[1][0], matrix[2][0]],
    [matrix[0][1], matrix[1][1], matrix[2][1]],
    [matrix[0][2], matrix[1][2], matrix[2][2]]
  ];
  
  const result = {
    x: invMatrix[0][0] * worldDelta.x + invMatrix[0][1] * worldDelta.y + invMatrix[0][2] * worldDelta.z,
    y: invMatrix[1][0] * worldDelta.x + invMatrix[1][1] * worldDelta.y + invMatrix[1][2] * worldDelta.z,
    z: invMatrix[2][0] * worldDelta.x + invMatrix[2][1] * worldDelta.y + invMatrix[2][2] * worldDelta.z
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

function planeCorners(el) {
  // If the plane is defined by points, return them directly
  if (el.points) {
    return el.points;
  }

  // Legacy: if not point-based, calculate from dimensions
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
      } else if (e.type === "Plane") {
        // Point-based plane
        e.points.forEach((p) => {
          pts.push({ ...p, kind: "PlaneCorner" });
        });

        // Add edge midpoints
        const edges = [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 0],
        ];
        edges.forEach(([i, j]) => {
          const midX = (e.points[i].x + e.points[j].x) / 2;
          const midY = (e.points[i].y + e.points[j].y) / 2;
          const midZ = (e.points[i].z + e.points[j].z) / 2;
          pts.push({ x: midX, y: midY, z: midZ, kind: "PlaneEdgeMid" });
        });

        // Add center of plane
        const centerX =
          e.points.reduce((sum, p) => sum + p.x, 0) / e.points.length;
        const centerY =
          e.points.reduce((sum, p) => sum + p.y, 0) / e.points.length;
        const centerZ =
          e.points.reduce((sum, p) => sum + p.z, 0) / e.points.length;
        pts.push({ x: centerX, y: centerY, z: centerZ, kind: "PlaneCenter" });
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
      } else if (e.type === "Plane") {
        // Legacy dimension-based plane
        const corners = planeCorners(e);
        corners.forEach((c) => pts.push({ ...c, kind: "PlaneCorner" }));
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
      if (e.type === "Member"|| e.type === "Load") {
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
    if (el.type === "Plane") {
      // For planes, maintain object integrity by moving the entire object
      // Find the closest snap point to any of the object's points
      let bestSnap = null;
      let bestDist = SNAP_PIXELS;
      let closestPointIndex = -1;

      el.points.forEach((p, i) => {
        const sc = screenCoords(p);
        pts.forEach((snapPt) => {
          const d = distanceScreen(sc, screenCoords(snapPt));
          if (d < bestDist) {
            bestDist = d;
            bestSnap = snapPt;
            closestPointIndex = i;
          }
        });
        lines.forEach((line) => {
          const near = nearestPointOnLine(p, line.p1, line.p2);
          const d = distanceScreen(sc, screenCoords(near));
          if (d < bestDist) {
            bestDist = d;
            bestSnap = near;
            closestPointIndex = i;
          }
        });
      });

      if (bestSnap && closestPointIndex >= 0) {
        // Calculate the offset needed to move the closest point to the snap point
        const closestPoint = el.points[closestPointIndex];
        const offsetX = bestSnap.x - closestPoint.x;
        const offsetY = bestSnap.y - closestPoint.y;
        const offsetZ = bestSnap.z - closestPoint.z;

        // Move all points of the object by the same offset
        el.points.forEach((p) => {
          p.x += offsetX;
          p.y += offsetY;
          p.z += offsetZ;
        });
      }
    } else {
      // For other elements (Member, Load, Support), snap each point individually
      el.points.forEach((p) => snapObj(p));
    }
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
    } else if (el.type === "Plane") {
      snapObj(el);
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
    // Use backend unit conversion API
    const conversion = await convertValue(currentValue, unitType, "to_display");
    displayValue = conversion.value.toFixed(3);
    unitSymbol = conversion.symbol;
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
    elForInputs._propertyInputs[prop + (pointIndex > -1 ? `_${pointIndex}` : "")] = input;
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
        elForInputs._propertyInputs[prop + (pointIndex > -1 ? `_${pointIndex}` : "")] = input;
      }
    }
    render(false);
    saveState();
  });
  container.appendChild(div);
}

async function renderProperties(force = false) {
  // Only rerender the panel if the selected element changed or force is true
  const pane = document.getElementById("props-content");
  if (!pane) return;
  
  // Always render if force is true, or if selected element changed
  if (!force && window._lastRenderedId === globalThis.selectedId) {
    // Only update values, not structure
    updatePropertyFieldValues();
    return;
  }
  
  window._lastRenderedId = globalThis.selectedId;
  pane.innerHTML = "";

  if (globalThis.selectedId !== null) {
    const el = globalThis.elements.find((e) => e.id === globalThis.selectedId);
    if (el) {
      el._propertyInputs = {}; // Map of property name to input/display DOM node
      const form = document.createElement("div");
      form.innerHTML = `<div class="mb-2">Type: <strong>${el.type}</strong></div>`;

      // Show points for all element types
      if (el.points) {
        for (let i = 0; i < el.points.length; i++) {
          form.innerHTML += `<div class="mb-2 fw-bold">Point ${i + 1}</div>`;
          await addNumberInput(form, "x", "x", el, "length", i, null, el);
          await addNumberInput(form, "y", "y", el, "length", i, null, el);
          await addNumberInput(form, "z", "z", el, "length", i, null, el);
        }
      }

      if (el.type === "Member") {
        // Material selector for Young's Modulus (E)
        if (!el.material) el.material = "wood";
        const materialDiv = document.createElement("div");
        materialDiv.className = "mb-2";
        materialDiv.innerHTML = `
          <label class='form-label'>Material</label>
          <select id='material-type' class='form-select form-select-sm w-auto d-inline'>
            <option value='wood' ${el.material === "wood" ? "selected" : ""}>Wood</option>
            <option value='steel' ${el.material === "steel" ? "selected" : ""}>Steel</option>
          </select>
        `;
        form.appendChild(materialDiv);
        const matSel = materialDiv.querySelector("#material-type");
        el._propertyInputs["material"] = matSel;
        matSel.addEventListener("change", async (ev) => {
          el.material = ev.target.value;
          if (el.material === "wood") {
            el.E = 10e9;
            el.density = 500;
          } else if (el.material === "steel") {
            el.E = 200e9;
            el.density = 7800;
          }
          el.mass = calculateMass(el);
          updatePropertyFieldValues();
          saveState();
        });
        if (el.material === "wood") {
          el.E = 10e9;
          el.density = 500;
        } else if (el.material === "steel") {
          el.E = 200e9;
          el.density = 7800;
        }
        if (!el.mass) {
          el.mass = calculateMass(el);
        }
        // Young's Modulus (E)
        const E_conv = await convertValue(el.E, "stress", "to_display");
        const Ediv = document.createElement("div");
        Ediv.className = "mb-2";
        Ediv.innerHTML = `<label class='form-label'>Young's Modulus (E)</label>
          <div class='input-group input-group-sm'>
            <input class='form-control' type='text' value='${E_conv.value.toFixed(3)}' disabled>
            <span class='input-group-text'>${E_conv.symbol}</span>
          </div>`;
        el._propertyInputs["E"] = Ediv.querySelector("input");
        form.appendChild(Ediv);
        // Density
        const density_conv = await convertValue(el.density, "density", "to_display");
        const densityDiv = document.createElement("div");
        densityDiv.className = "mb-2";
        densityDiv.innerHTML = `<label class='form-label'>Density</label>
          <div class='input-group input-group-sm'>
            <input class='form-control' type='text' value='${density_conv.value.toFixed(1)}' disabled>
            <span class='input-group-text'>${density_conv.symbol}</span>
          </div>`;
        el._propertyInputs["density"] = densityDiv.querySelector("input");
        form.appendChild(densityDiv);
        // Cross Sectional Area (A)
        await addNumberInput(form, "Cross Sectional Area (A)", "A", el, "area", -1, async () => {
          el.mass = calculateMass(el);
          updatePropertyFieldValues();
          saveState();
        }, el);
        // Mass (calculated)
        const mass_conv = await convertValue(el.mass, "mass", "to_display");
        const massDiv = document.createElement("div");
        massDiv.className = "mb-2";
        massDiv.innerHTML = `<label class='form-label'>Mass (calculated)</label>
          <div class='input-group input-group-sm'>
            <input class='form-control' type='text' value='${mass_conv.value.toFixed(3)}' disabled>
            <span class='input-group-text'>${mass_conv.symbol}</span>
          </div>`;
        el._propertyInputs["mass"] = massDiv.querySelector("input");
        form.appendChild(massDiv);
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
          el._propertyInputs[p] = input;
          form.appendChild(div);
        });
      } else if (el.type === "Load") {
        await addNumberInput(form, "amount", "amount", el, "force", -1, null, el);
      } else if (el.type === "Plane") {
        if (!el.material) el.material = "wood";
        const materialDiv = document.createElement("div");
        materialDiv.className = "mb-2";
        materialDiv.innerHTML = `
          <label class='form-label'>Material</label>
          <select id='material-type' class='form-select form-select-sm w-auto d-inline'>
            <option value='wood' ${el.material === "wood" ? "selected" : ""}>Wood</option>
            <option value='steel' ${el.material === "steel" ? "selected" : ""}>Steel</option>
          </select>
        `;
        form.appendChild(materialDiv);
        const matSel = materialDiv.querySelector("#material-type");
        el._propertyInputs["material"] = matSel;
        matSel.addEventListener("change", async (ev) => {
          el.material = ev.target.value;
          if (el.material === "wood") {
            el.E = 10e9;
            el.density = 500;
          } else if (el.material === "steel") {
            el.E = 200e9;
            el.density = 7800;
          }
          el.mass = calculateMass(el);
          updatePropertyFieldValues();
          saveState();
        });
        if (el.material === "wood") {
          el.E = 10e9;
          el.density = 500;
        } else if (el.material === "steel") {
          el.E = 200e9;
          el.density = 7800;
        }
        if (!el.mass) {
          el.mass = calculateMass(el);
        }
        // Add thickness field for planes
        if (!el.thickness) el.thickness = 0.01;
        await addNumberInput(form, "Thickness", "thickness", el, "length", -1, async () => {
          el.mass = calculateMass(el);
          updatePropertyFieldValues();
          saveState();
        }, el);
        // Density
        const density_conv = await convertValue(el.density, "density", "to_display");
        const densityDiv = document.createElement("div");
        densityDiv.className = "mb-2";
        densityDiv.innerHTML = `<label class='form-label'>Density</label>
          <div class='input-group input-group-sm'>
            <input class='form-control' type='text' value='${density_conv.value.toFixed(1)}' disabled>
            <span class='input-group-text'>${density_conv.symbol}</span>
          </div>`;
        el._propertyInputs["density"] = densityDiv.querySelector("input");
        form.appendChild(densityDiv);
        // Mass (calculated)
        const mass_conv = await convertValue(el.mass, "mass", "to_display");
        const massDiv = document.createElement("div");
        massDiv.className = "mb-2";
        massDiv.innerHTML = `<label class='form-label'>Mass (calculated)</label>
          <div class='input-group input-group-sm'>
            <input class='form-control' type='text' value='${mass_conv.value.toFixed(3)}' disabled>
            <span class='input-group-text'>${mass_conv.symbol}</span>
          </div>`;
        el._propertyInputs["mass"] = massDiv.querySelector("input");
        form.appendChild(massDiv);
      }
      pane.appendChild(form);
      document.getElementById("delete-btn").disabled = false;
    }
  } else {
    document.getElementById("delete-btn").disabled = true;
  }

  // Global properties section - always render this
  const globalDiv = document.createElement("div");
  globalDiv.innerHTML = `<hr><h6>Global</h6>
  <div class='mb-2'><label class='form-label'>Units</label><select id='global-units' class='form-select form-select-sm'>
    <option value='metric'>Metric</option><option value='imperial'>Imperial</option></select></div>`;
  pane.appendChild(globalDiv);

  // Add gravity input with units using backend API
  const gravityDiv = document.createElement("div");
  gravityDiv.className = "mb-2";

  // Get gravity display value and unit from backend
  const gravityConversion = await convertValue(
    globalProps.g,
    "acceleration",
    "to_display",
  );
  const gravityValue = gravityConversion.value.toFixed(3);
  const gravityUnit = gravityConversion.symbol;

  gravityDiv.innerHTML = `
    <label class='form-label'>Gravity (g)</label>
    <div class='input-group input-group-sm'>
      <input id='global-g' class='form-control' type='text' value='${gravityValue}'>
      <span class='input-group-text'>${gravityUnit}</span>
    </div>
  `;
  pane.appendChild(gravityDiv);

  const gInput = gravityDiv.querySelector("#global-g");
  gInput.addEventListener("input", async (ev) => {
    const text = ev.target.value;
    let v = parseFloat(text);

    if (Number.isFinite(v)) {
      // Convert from display units to SI using backend API
      globalProps.g = await convertValue(v, "acceleration", "from_display");
    }
  });

  const sel = globalDiv.querySelector("#global-units");
  sel.value = globalProps.units;
  sel.addEventListener("change", async (ev) => {
    const old = globalProps.units;
    globalProps.units = ev.target.value;
    if (old !== globalProps.units) {
      // Convert gravity value
      if (globalProps.units === "metric") {
        globalProps.g = 9.81; // m/s²
      } else {
        globalProps.g = 32.174 * 0.3048; // ft/s² converted to m/s²
      }
      // Save the new unit system to the backend immediately
      await saveState();
      // Re-render properties to update unit displays
      await renderProperties(true);
    }
  });
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
  if (el._propertyInputs["density"] && el._propertyInputs["density"] !== focusedElement) {
    const density_conv = await convertValue(el.density, "density", "to_display");
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
  if (el._propertyInputs["thickness"] && el._propertyInputs["thickness"] !== focusedElement) {
    const thick_conv = await convertValue(el.thickness, "length", "to_display");
    el._propertyInputs["thickness"].value = thick_conv.value.toFixed(3);
  }
  // Update per-point coordinates
  if (el.points) {
    for (let i = 0; i < el.points.length; i++) {
      ["x", "y", "z"].forEach(async (coord) => {
        const key = coord + "_" + i;
        if (el._propertyInputs[key] && el._propertyInputs[key] !== focusedElement) {
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
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 + globalThis.panX;
  const cy = rect.height / 2 + globalThis.panY;

  // Update current view display
  const rx = ((globalThis.rotationX * 180) / Math.PI).toFixed(1);
  const ry = ((globalThis.rotationY * 180) / Math.PI).toFixed(1);
  const rz = ((globalThis.rotationZ * 180) / Math.PI).toFixed(1);
  document.getElementById("current-view").textContent =
    `Rotated (X:${rx}°, Y:${ry}°, Z:${rz}°)`;

  // First, render all points as dots
  const pointMap = new Map();
  globalThis.elements.forEach((el) => {
    if (el.points) {
      // All elements now use points array
      el.points.forEach((p) => {
        const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
        if (!pointMap.has(key)) {
          pointMap.set(key, { ...p, type: el.type });
        }
      });
    } else {
      // Legacy fallback for any remaining elements
      if (el.type === "Support") {
        const key = `${el.x.toFixed(6)},${el.y.toFixed(6)},${el.z.toFixed(6)}`;
        if (!pointMap.has(key)) {
          pointMap.set(key, { x: el.x, y: el.y, z: el.z, type: "Support" });
        }
      } else if (el.type === "Load") {
        const key = `${el.x.toFixed(6)},${el.y.toFixed(6)},${el.z.toFixed(6)}`;
        if (!pointMap.has(key)) {
          pointMap.set(key, { x: el.x, y: el.y, z: el.z, type: "Load" });
        }
      } else if (el.type === "Member") {
        const key1 = `${el.x.toFixed(6)},${el.y.toFixed(6)},${el.z.toFixed(6)}`;
        const key2 = `${(el.x2 ?? el.x).toFixed(6)},${(el.y2 ?? el.y).toFixed(6)},${(el.z2 ?? el.z).toFixed(6)}`;
        if (!pointMap.has(key1)) {
          pointMap.set(key1, { x: el.x, y: el.y, z: el.z, type: "Member" });
        }
        if (!pointMap.has(key2)) {
          pointMap.set(key2, {
            x: el.x2 ?? el.x,
            y: el.y2 ?? el.y,
            z: el.z2 ?? el.z,
            type: "Member",
          });
        }
      } else if (el.type === "Plane") {
        (el.points || []).forEach((p) => {
          const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
          if (!pointMap.has(key)) {
            pointMap.set(key, { ...p, type: el.type });
          }
        });
      }
    }
  });

  // Render points as dots
  pointMap.forEach((point) => {
    const p = projectPoint({ x: point.x, y: point.y, z: point.z });
    const sx = cx + (p.x || 0) * globalThis.zoom;
    const sy = cy + (p.y || 0) * globalThis.zoom;

    const dot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    dot.setAttribute("cx", sx);
    dot.setAttribute("cy", sy);
    dot.setAttribute("r", 3 * globalThis.zoom);
    dot.setAttribute("fill", point.type === "Support" ? "green" : "blue");
    dot.setAttribute("stroke", "black");
    dot.setAttribute("stroke-width", 1);
    svg.appendChild(dot);
  });

  globalThis.elements.forEach((el) => {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.dataset.id = el.id;
    g.style.cursor = "move";
    g.addEventListener("mousedown", startDrag);
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      selectElement(el.id);
    });

    let shape;
    if (el.type === "Member") {
      const p1 = projectPoint(el.points[0]);
      const p2 = projectPoint(el.points[1]);
      shape = document.createElementNS("http://www.w3.org/2000/svg", "line");
      shape.setAttribute("x1", cx + (p1.x || 0) * globalThis.zoom);
      shape.setAttribute("y1", cy + (p1.y || 0) * globalThis.zoom);
      shape.setAttribute("x2", cx + (p2.x || 0) * globalThis.zoom);
      shape.setAttribute("y2", cy + (p2.y || 0) * globalThis.zoom);
      shape.setAttribute("stroke", "blue");
      shape.setAttribute("stroke-width", 2);
    }else if (el.type === "Load") {
      // Treat loads like members with draggable endpoints
      const p1 = projectPoint(el.points[0]);
      const p2 = projectPoint(el.points[1]);
      shape = document.createElementNS("http://www.w3.org/2000/svg", "line");
      shape.setAttribute("x1", cx + (p1.x || 0) * globalThis.zoom);
      shape.setAttribute("y1", cy + (p1.y || 0) * globalThis.zoom);
      shape.setAttribute("x2", cx + (p2.x || 0) * globalThis.zoom);
      shape.setAttribute("y2", cy + (p2.y || 0) * globalThis.zoom);
      shape.setAttribute("stroke", "red");
      shape.setAttribute("stroke-width", 2);

      // Add arrowhead at the end point
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const arrowSize = 6 * globalThis.zoom;
      const b1x = cx + (p2.x || 0) * globalThis.zoom + nx * arrowSize;
      const b1y = cy + (p2.y || 0) * globalThis.zoom + ny * arrowSize;
      const b2x = cx + (p2.x || 0) * globalThis.zoom - nx * arrowSize;
      const b2y = cy + (p2.y || 0) * globalThis.zoom - ny * arrowSize;
      const tx =
        cx + (p2.x || 0) * globalThis.zoom + (dx / len) * arrowSize * 1.5;
      const ty =
        cy + (p2.y || 0) * globalThis.zoom + (dy / len) * arrowSize * 1.5;

      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polygon",
      );
      arrow.setAttribute("points", `${b1x},${b1y} ${b2x},${b2y} ${tx},${ty}`);
      arrow.setAttribute("fill", "red");
      g.appendChild(arrow);
    } else if (el.type === "Plane") {
      // Always render planes - they should be visible in all views
      const pts = el.points.map((p) => {
        const pr = projectPoint(p);
        return [
          cx + (pr.x || 0) * globalThis.zoom,
          cy + (pr.y || 0) * globalThis.zoom,
        ];
      });
      shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      shape.setAttribute("points", pts.map((pt) => pt.join(",")).join(" "));
      shape.setAttribute("fill", "rgba(0,0,255,0.2)");
      shape.setAttribute("stroke", "blue");
    } else if (el.type === "Support") {
      shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const p = projectPoint(el.points[0]);
      const sx = cx + (p.x || 0) * globalThis.zoom;
      const sy = cy + (p.y || 0) * globalThis.zoom;
      shape.setAttribute(
        "points",
        `${sx - 6 * globalThis.zoom},${sy + 10 * globalThis.zoom} ${sx + 6 * globalThis.zoom},${sy + 10 * globalThis.zoom} ${sx},${sy}`,
      );
      shape.setAttribute("fill", "green");
    }
    if (shape) g.appendChild(shape);
    if (el.id === globalThis.selectedId) g.setAttribute("stroke", "orange");
    svg.appendChild(g);
  });

  // Render calculation results on top
  renderCalculationResults();

  // Update properties panel if requested
  if (updateProps) {
    await renderProperties();
  }

  updateViewButtonStates();
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
    base.E = 200e9;
    base.A = 0.01;
    base.I = 1e-6;
    // Set material and density based on type
    base.material = "wood";
    base.density = 500;
    // Calculate mass dynamically
    base.mass = calculateMass(base);
  } else if (type === "Plane") {
    // Create plane with 4 corner points
    const l = 40 / 2; // half length
    const w = 40 / 2; // half width

    // Determine normal direction based on current rotation
    // Find the axis that's most aligned with the view direction
    const matrix = getRotationMatrix();
    const viewDir = [matrix[2][0], matrix[2][1], matrix[2][2]]; // Z axis of rotation matrix
    const absX = Math.abs(viewDir[0]);
    const absY = Math.abs(viewDir[1]);
    const absZ = Math.abs(viewDir[2]);

    let normal;
    if (absX >= absY && absX >= absZ) {
      normal = "X";
    } else if (absY >= absZ) {
      normal = "Y";
    } else {
      normal = "Z";
    }

    // Generate corner points based on normal direction
    let points;
    if (normal === "X") {
      points = [
        { x: base.x, y: base.y - l, z: base.z - w },
        { x: base.x, y: base.y + l, z: base.z - w },
        { x: base.x, y: base.y + l, z: base.z + w },
        { x: base.x, y: base.y - l, z: base.z + w },
      ];
    } else if (normal === "Y") {
      points = [
        { x: base.x - l, y: base.y, z: base.z - w },
        { x: base.x + l, y: base.y, z: base.z - w },
        { x: base.x + l, y: base.y, z: base.z + w },
        { x: base.x - l, y: base.y, z: base.z + w },
      ];
    } else {
      // Z normal
      points = [
        { x: base.x - l, y: base.y - w, z: base.z },
        { x: base.x + l, y: base.y - w, z: base.z },
        { x: base.x + l, y: base.y + w, z: base.z },
        { x: base.x - l, y: base.y + w, z: base.z },
      ];
    }

    base.points = points;
    base.normal = normal;
    // Set material and density
    base.material = "wood";
    base.density = 500;
    base.thickness = 0.01; // Default 10mm thickness
    // Calculate mass dynamically
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
  applySnapping(base);
  saveState();
  render(false); // Don't update properties here, we'll do it directly
  renderProperties(); // Always update properties when adding elements
}

function deleteElement() {
  if (globalThis.selectedId === null) return;
  globalThis.elements = globalThis.elements.filter((e) => e.id !== globalThis.selectedId);
  globalThis.selectedId = null;
  saveState();
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
  } else if (el.type === "Plane") {
    // Check for edge/face dragging instead of individual points
    if (el.type === "Plane") {
      // For planes, check for edge dragging first
      const pts = (el.points || []).map((p) => screenCoords(p));
      if (pts.length >= 4) {
        const edges = [
          [pts[0], pts[1]], // edge 0-1
          [pts[1], pts[2]], // edge 1-2
          [pts[2], pts[3]], // edge 2-3
          [pts[3], pts[0]], // edge 3-0
        ];

        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          const distance = distanceToSegment2D(
            { x: mx, y: my },
            edge[0],
            edge[1],
          );
          if (distance < 8) {
            dragMode = `edge-${i}`;
            break;
          }
        }
      }
      
      // If no edge was clicked, it's a face drag (body drag)
      if (dragMode === "body") {
        dragMode = "face";
      }
    }

    // If no edge/face was clicked, allow body drag
    if (dragMode === "body") {
      // Check for edge dragging for legacy dimension-based elements
      if (!el.points) {
        const rect = planeScreenRect(el);
        const edgeThreshold = 8;

        // Check if mouse is near edges for resizing
        if (Math.abs(mx - rect.left) < edgeThreshold) dragMode = "left";
        else if (Math.abs(mx - rect.right) < edgeThreshold) dragMode = "right";
        else if (Math.abs(my - rect.top) < edgeThreshold) dragMode = "top";
        else if (Math.abs(my - rect.bottom) < edgeThreshold)
          dragMode = "bottom";
      }
    }
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
  } else if (el.type === "Plane") {
    if (el.points) {
      // Point-based plane with edge dragging
      if (dragMode.startsWith("edge-")) {
        const edgeIndex = parseInt(dragMode.split("-")[1], 10);
        const edges = [
          [0, 1], // edge 0-1
          [1, 2], // edge 1-2
          [2, 3], // edge 2-3
          [3, 0], // edge 3-0
        ];

        if (edgeIndex < edges.length) {
          const [p1Index, p2Index] = edges[edgeIndex];
          const p1 = el.points[p1Index];
          const p2 = el.points[p2Index];
          const orig_p1 = dragOrig.points[p1Index];
          const orig_p2 = dragOrig.points[p2Index];

          // Apply orthogonal constraint
          const constrainedDelta = constrainToOrthogonal(
            delta,
            edgeIndex,
            "Plane",
          );

          // Move both points of the edge
          p1.x = orig_p1.x + (constrainedDelta.x || 0);
          p1.y = orig_p1.y + (constrainedDelta.y || 0);
          p1.z = orig_p1.z + (constrainedDelta.z || 0);
          p2.x = orig_p2.x + (constrainedDelta.x || 0);
          p2.y = orig_p2.y + (constrainedDelta.y || 0);
          p2.z = orig_p2.z + (constrainedDelta.z || 0);
        }
      } else if (dragMode === "face") {
        // Face drag - move all points (move the whole plane)
        el.points.forEach((p, i) => {
          const orig_p = dragOrig.points[i];
          p.x = orig_p.x + (delta.x || 0);
          p.y = orig_p.y + (delta.y || 0);
          p.z = orig_p.z + (delta.z || 0);
        });
      } else {
        // Body drag - move all points (fallback)
        el.points.forEach((p, i) => {
          const orig_p = dragOrig.points[i];
          p.x = orig_p.x + (delta.x || 0);
          p.y = orig_p.y + (delta.y || 0);
          p.z = orig_p.z + (delta.z || 0);
        });
      }
    } else {
      // Legacy dimension-based plane
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
          if (!e.mass || e.material !== obj.material || e.density !== obj.density) {
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
      } else if (obj.type === "Plane") {
        if (e.points) {
          // Point-based plane
          obj.points = e.points;
          obj.normal = e.normal;
          // Handle material and density
          obj.material = e.material ?? "wood";
          obj.density = e.density ?? 500;
          obj.thickness = e.thickness ?? 0.01;
          // Recalculate mass if not set or if material/density/thickness changed
          if (!e.mass || e.material !== obj.material || e.density !== obj.density || e.thickness !== obj.thickness) {
            obj.mass = calculateMass(obj);
          } else {
            obj.mass = e.mass;
          }
        } else {
          // Legacy dimension-based plane
          obj.length = e.length ?? 40;
          obj.width = e.width ?? 40;
          obj.normal = e.normal ?? currentView[1];
          // Set default material and density for legacy elements
          obj.material = "wood";
          obj.density = 500;
          obj.thickness = 0.01;
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
document.getElementById("canvas").addEventListener("click", async () => {
  // Only deselect if we're not panning or rotating
  if (!globalThis.isPanning && !globalThis.isRotating) {
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
  // This function has been refactored to treat planes as simple braced frames
  // rather than fine-grained meshes, based on user feedback.

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
        E: el.E ?? 200e9,
        A: el.A ?? 0.01,
        I: el.I ?? 1e-6,
        J: el.I ? el.I * 2 : 2e-6, // Approx for a circle
        G: (el.E ?? 200e9) / (2 * (1 + 0.3)), // Assume steel/aluminum
      });
    } else if (el.type === "Support") {
      const pointId = getOrAddPoint(el.points[0]);
      supports.push({
        point: pointId,
        ux: el.ux !== false, uy: el.uy !== false, uz: el.uz !== false,
        rx: el.rx !== false, ry: el.ry !== false, rz: el.rz !== false,
      });
    }
  });

  // Process Planes into simple frame structures
  globalThis.elements.forEach((el) => {
    if (el.type === "Plane") {
      if (!el.points || el.points.length < 4) return;
      
      const p = el.points.map(pt => getOrAddPoint(pt));

      const E = el.E ?? (el.material === 'steel' ? 200e9 : 10e9);
      const G = E / (2 * (1 + 0.3));
      const t = el.thickness ?? 0.01;
      
      // Assume square cross-section for generated members
      const A = t * t;
      const I = Math.pow(t, 4) / 12;
      const J = 0.1406 * Math.pow(t, 4);

      const memberProps = { E, A, I, G, J };
      
      // Edges
      members.push({ start: p[0], end: p[1], ...memberProps });
      members.push({ start: p[1], end: p[2], ...memberProps });
      members.push({ start: p[2], end: p[3], ...memberProps });
      members.push({ start: p[3], end: p[0], ...memberProps });
      
      // Diagonals for shear stiffness
      members.push({ start: p[0], end: p[2], ...memberProps });
      members.push({ start: p[1], end: p[3], ...memberProps });
    }
  });

  // Process Loads
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
          mx: 0, my: 0, mz: 0,
          amount: amt,
          isGravityLoad: false,
        });
    }
  });
  
  // Process Gravity Loads
    globalThis.elements.forEach((el) => {
        if (el.mass && el.mass > 0 && el.points) {
            // Find center of gravity
            const cog = {
                x: el.points.reduce((sum, p) => sum + p.x, 0) / el.points.length,
                y: el.points.reduce((sum, p) => sum + p.y, 0) / el.points.length,
                z: el.points.reduce((sum, p) => sum + p.z, 0) / el.points.length
            };
            
            // Find the closest structural point to apply the gravity load
            let closestPointId = -1;
            let minDistance = Infinity;

            points.forEach(point => {
                const d = Math.hypot(point.x - cog.x, point.y - cog.y, point.z - cog.z);
                if (d < minDistance) {
                    minDistance = d;
                    closestPointId = point.id;
                }
            });

            if (closestPointId !== -1) {
                const gravityForce = el.mass * globalProps.g;
                loads.push({
                    point: closestPointId,
                    fx: 0,
                    fy: -gravityForce, // Gravity acts in -Y
                    fz: 0,
                    mx: 0, my: 0, mz: 0,
                    amount: gravityForce,
                    isGravityLoad: true,
                    sourceElement: el.id,
                });
            }
        }
    });

  return { points, members, loads, supports };
}

async function solveModel() {
  const payload = buildModel();
  console.log("Solving model:", payload);

  // Add unit system to payload
  const unitSystem = globalProps.units || "metric";
  payload.unit_system = unitSystem;

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

  // Store results for visualization
  lastCalculationResults = {
    displacements: data.displacements || {},
    reactions: data.reactions || {},
    points: payload.points,
    unit_system: data.unit_system,
    gravityLoads: payload.loads.filter((load) => load.isGravityLoad),
  };

  const lines = [];

  // Header
  lines.push("STRUCTURAL ANALYSIS REPORT");
  lines.push("=".repeat(50));
  lines.push("");

  // Model summary
  lines.push("MODEL SUMMARY:");
  lines.push(`  Total Points: ${payload.points.length}`);
  lines.push(`  Total Members: ${payload.members.length}`);
  lines.push(`  Total Loads: ${payload.loads.length}`);
  lines.push(`  Total Supports: ${payload.supports.length}`);
  lines.push("");

  // Issues section
  if (data.issues && data.issues.length) {
    lines.push("ISSUES DETECTED:");
    for (const issue of data.issues) {
      lines.push(`  ⚠️  ${issue}`);
    }
    lines.push("");
  }

  // Displacements section
  lines.push("DISPLACEMENTS:");
  lines.push("-".repeat(20));
  const displacements = Object.entries(data.displacements || {});
  if (displacements.length === 0) {
    lines.push("  No displacement results available.");
  } else {
    for (const [pointId, dispData] of displacements) {
      const point = payload.points.find((p) => p.id === parseInt(pointId));
      if (point) {
        lines.push(
          `  Point ${pointId} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}):`,
        );
        lines.push(`    Horizontal displacement (ux): ${dispData.ux}`);
        lines.push(`    Vertical displacement (uy): ${dispData.uy}`);
        lines.push(`    Rotation (rz): ${dispData.rz}`);
        lines.push("");
      }
    }
  }

  // Reactions section
  lines.push("REACTIONS:");
  lines.push("-".repeat(20));
  const reactions = Object.entries(data.reactions || {});
  if (reactions.length === 0) {
    lines.push("  No reaction results available.");
  } else {
    for (const [pointId, reactData] of reactions) {
      const point = payload.points.find((p) => p.id === parseInt(pointId));
      if (point) {
        lines.push(
          `  Point ${pointId} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}):`,
        );
        lines.push(`    Horizontal force (fx): ${reactData.fx}`);
        lines.push(`    Vertical force (fy): ${reactData.fy}`);
        lines.push(`    Moment (mz): ${reactData.mz}`);
        lines.push("");
      }
    }
  }

  // Load summary
  lines.push("APPLIED LOADS:");
  lines.push("-".repeat(20));
  if (payload.loads.length === 0) {
    lines.push("  No loads applied.");
  } else {
    let regularLoadCount = 0;
    let gravityLoadCount = 0;

    for (let i = 0; i < payload.loads.length; i++) {
      const load = payload.loads[i];
      const point = payload.points.find((p) => p.id === load.point);
      if (point) {
        const magnitude = Math.sqrt(load.fx * load.fx + load.fy * load.fy);
        const angle = (Math.atan2(load.fy, load.fx) * 180) / Math.PI;
        const unitSystem = data.unit_system || "metric";
        const forceUnit = unitSystem === "metric" ? "kN" : "kip";
        const magnitudeFormatted =
          unitSystem === "metric"
            ? (magnitude / 1000).toFixed(6)
            : (magnitude / 4448.22).toFixed(6);

        if (load.isGravityLoad) {
          gravityLoadCount++;
          const sourceElement = globalThis.elements.find(
            (e) => e.id === load.sourceElement,
          );
          const mass = sourceElement ? sourceElement.mass : 0;
          const massUnit = unitSystem === "metric" ? "kg" : "lb";
          const massFormatted =
            unitSystem === "metric"
              ? mass.toFixed(3)
              : (mass * 2.20462).toFixed(3);

          lines.push(
            `  Gravity Load ${gravityLoadCount} at Point ${load.point} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}):`,
          );
          lines.push(
            `    Source: ${sourceElement ? sourceElement.type : "Unknown"} (ID: ${load.sourceElement})`,
          );
          lines.push(`    Mass: ${massFormatted} ${massUnit}`);
          lines.push(
            `    Gravity Force: ${magnitudeFormatted} ${forceUnit} (downward)`,
          );
          lines.push(`    Direction: 270° (straight down)`);
          lines.push(
            `    Components: fx = ${load.fx.toFixed(6)} N, fy = ${load.fy.toFixed(6)} N`,
          );
        } else {
          regularLoadCount++;
          lines.push(
            `  Load ${regularLoadCount} at Point ${load.point} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}):`,
          );
          lines.push(`    Magnitude: ${magnitudeFormatted} ${forceUnit}`);
          lines.push(`    Direction: ${angle.toFixed(2)}° from horizontal`);
          lines.push(
            `    Components: fx = ${load.fx.toFixed(6)} N, fy = ${load.fy.toFixed(6)} N`,
          );
        }
        lines.push("");
      }
    }

    // Summary of load types
    if (regularLoadCount > 0 || gravityLoadCount > 0) {
      lines.push("LOAD SUMMARY:");
      if (regularLoadCount > 0) {
        lines.push(`  Regular loads: ${regularLoadCount}`);
      }
      if (gravityLoadCount > 0) {
        lines.push(`  Gravity loads: ${gravityLoadCount}`);
      }
      lines.push("");
    }
  }

  // Support summary
  lines.push("SUPPORT CONDITIONS:");
  lines.push("-".repeat(20));
  if (payload.supports.length === 0) {
    lines.push("  No supports defined.");
  } else {
    for (let i = 0; i < payload.supports.length; i++) {
      const support = payload.supports[i];
      const point = payload.points.find((p) => p.id === support.point);
      if (point) {
        const constraints = [];
        if (support.ux) constraints.push("ux");
        if (support.uy) constraints.push("uy");
        if (support.rz) constraints.push("rz");
        lines.push(
          `  Support ${i + 1} at Point ${support.point} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}):`,
        );
        lines.push(
          `    Constraints: ${constraints.length > 0 ? constraints.join(", ") : "none"}`,
        );
        lines.push("");
      }
    }
  }

  // Member summary
  lines.push("MEMBER PROPERTIES:");
  lines.push("-".repeat(20));
  if (payload.members.length === 0) {
    lines.push("  No members defined.");
  } else {
    for (let i = 0; i < payload.members.length; i++) {
      const member = payload.members[i];
      const startPoint = payload.points.find((p) => p.id === member.start);
      const endPoint = payload.points.find((p) => p.id === member.end);
      if (startPoint && endPoint) {
        const length = Math.sqrt(
          Math.pow(endPoint.x - startPoint.x, 2) +
            Math.pow(endPoint.y - startPoint.y, 2),
        );
        const unitSystem = data.unit_system || "metric";
        const lengthUnit = unitSystem === "metric" ? "mm" : "in";
        const lengthFormatted =
          unitSystem === "metric"
            ? (length * 1000).toFixed(6)
            : (length * 39.3701).toFixed(6);
        const stressUnit = unitSystem === "metric" ? "GPa" : "ksi";
        const EFormatted =
          unitSystem === "metric"
            ? (member.E / 1e9).toFixed(3)
            : (member.E / 6894760.0).toFixed(3);
        const areaUnit = unitSystem === "metric" ? "mm²" : "in²";
        const AFormatted =
          unitSystem === "metric"
            ? (member.A * 1e6).toFixed(3)
            : (member.A * 1550.0031).toFixed(3);
        const inertiaUnit = unitSystem === "metric" ? "mm⁴" : "in⁴";
        const IFormatted =
          unitSystem === "metric"
            ? (member.I * 1e12).toFixed(3)
            : (member.I * 2.4025e9).toFixed(3);

        lines.push(
          `  Member ${i + 1} (Points ${member.start} → ${member.end}):`,
        );
        lines.push(`    Length: ${lengthFormatted} ${lengthUnit}`);
        lines.push(`    Young's Modulus (E): ${EFormatted} ${stressUnit}`);
        lines.push(`    Cross-sectional Area (A): ${AFormatted} ${areaUnit}`);
        lines.push(
          `    Second Moment of Inertia (I): ${IFormatted} ${inertiaUnit}`,
        );
        lines.push("");
      }
    }
  }

  // Mass and Gravity Summary
  lines.push("MASS AND GRAVITY SUMMARY:");
  lines.push("-".repeat(20));
  let totalMass = 0;
  const massByType = {};

  globalThis.elements.forEach((el) => {
    if (el.mass && el.mass > 0) {
      totalMass += el.mass;
      if (!massByType[el.type]) {
        massByType[el.type] = 0;
      }
      massByType[el.type] += el.mass;
    }
  });

  if (totalMass > 0) {
    const unitSystem = data.unit_system || "metric";
    const massUnit = unitSystem === "metric" ? "kg" : "lb";
    const massFormatted =
      unitSystem === "metric"
        ? totalMass.toFixed(3)
        : (totalMass * 2.20462).toFixed(3);
    const gravityForce = totalMass * globalProps.g;
    const forceUnit = unitSystem === "metric" ? "kN" : "kip";
    const forceFormatted =
      unitSystem === "metric"
        ? (gravityForce / 1000).toFixed(6)
        : (gravityForce / 4448.22).toFixed(6);

    lines.push(`  Total Mass: ${massFormatted} ${massUnit}`);
    lines.push(`  Total Gravity Force: ${forceFormatted} ${forceUnit}`);
    lines.push("");

    // Breakdown by element type
    lines.push("  Mass Breakdown by Element Type:");
    Object.entries(massByType).forEach(([type, mass]) => {
      const typeMassFormatted =
        unitSystem === "metric" ? mass.toFixed(3) : (mass * 2.20462).toFixed(3);
      lines.push(`    ${type}: ${typeMassFormatted} ${massUnit}`);
    });
    lines.push("");
  } else {
    lines.push("  No mass defined for any elements.");
    lines.push("");
  }

  out.textContent = lines.join("\n");

  // Re-render to show calculation results
  render(false);
}

document.getElementById("solve-btn").addEventListener("click", solveModel);

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
  if (!lastCalculationResults) return;

  const svg = document.getElementById("canvas");

  const { displacements, reactions, points, gravityLoads } =
    lastCalculationResults;

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

    let fx, fy, mz;

    // Handle different response formats
    if (v && typeof v === "object") {
      if (Array.isArray(v)) {
        // Direct array format
        [fx, fy, mz] = v;
      } else if (v.raw && Array.isArray(v.raw)) {
        // New format with raw values
        [fx, fy, mz] = v.raw;
      } else if (
        v.fx !== undefined &&
        v.fy !== undefined &&
        v.mz !== undefined
      ) {
        // Object format with fx, fy, mz properties
        fx = v.fx;
        fy = v.fy;
        mz = v.mz;
      } else {
        // Skip if we can't extract force components
        return;
      }
    } else {
      // Skip if not an object
      return;
    }

    const magnitude = Math.sqrt(fx * fx + fy * fy);
    if (magnitude < 1e-6) return; // Skip very small reactions

    // Define the vector in 3D world space
    const world_scale = 0.001 * 20; // Scale for visualization (was 0.001 * 0.1)
    const start_3d = { x: point.x, y: point.y, z: point.z };
    const end_3d = {
      x: point.x + fx * world_scale,
      y: point.y + fy * world_scale,
      z: point.z, // fz is 0 in 2D analysis
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

      // Gravity acts downward (-Z direction, which projects as +Y in screen space)
      const world_scale = 0.001 * 20;
      const start_3d = { x: point.x, y: point.y, z: point.z };
      const end_3d = {
        x: point.x,
        y: point.y,
        z: point.z - magnitude * world_scale, // Downward in Z
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

function constrainToOrthogonal(delta, faceIndex) {
  // For planes: constrain edge movements to be orthogonal to the edge direction
  const constrained = { x: 0, y: 0, z: 0 };

  // Get the current rotation matrix to understand the view orientation
  const matrix = getRotationMatrix();
  
  // For plane edges, we need to determine which direction the edge is pointing
  // in the current view and constrain movement to be perpendicular to that direction
  
  // Edge definitions for a plane (assuming standard rectangular plane)
  const edgeDirections = [
    [0, 1], // edge 0-1: typically along Y axis
    [1, 2], // edge 1-2: typically along X axis  
    [2, 3], // edge 2-3: typically along Y axis
    [3, 0], // edge 3-0: typically along X axis
  ];

  if (faceIndex < edgeDirections.length) {
    // For now, use a simplified approach: allow movement in the plane
    // that contains the edge, but constrain to the two axes of that plane
    const edgePlanes = [
      ["y", "z"], // edge 0-1: Y-Z plane
      ["x", "z"], // edge 1-2: X-Z plane
      ["y", "z"], // edge 2-3: Y-Z plane
      ["x", "z"], // edge 3-0: X-Z plane
    ];

    const axes = edgePlanes[faceIndex];
    axes.forEach((axis) => {
      constrained[axis] = delta[axis] || 0;
    });
  }

  return constrained;
}

function selectElement(id) {
  globalThis.selectedId = id;
  render(false); // Don't update properties here, we'll do it directly
  renderProperties(); // Always update properties when selecting an element
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
  } else if (el.type === "Plane") {
    // Mass = Area × Thickness × Density
    const area = calculateArea(el);
    const thickness = el.thickness || 0.01;
    return area * thickness * el.density;
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
      Math.pow(p2.z - p1.z, 2)
    );
  }
  return 0.1; // Default length
}

// Helper function to calculate area of a plane
function calculateArea(el) {
  if (el.points && el.points.length >= 4) {
    // Calculate area using shoelace formula for polygon
    let area = 0;
    for (let i = 0; i < el.points.length; i++) {
      const j = (i + 1) % el.points.length;
      area += el.points[i].x * el.points[j].y;
      area -= el.points[j].x * el.points[i].y;
    }
    return Math.abs(area) / 2;
  }
  // Fallback to legacy dimension-based calculation
  const length = el.length || 40;
  const width = el.width || 40;
  return length * width;
}