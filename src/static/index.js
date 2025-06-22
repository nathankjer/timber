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
    body: JSON.stringify({ name: "New Sheet" }),
  });
  if (resp.ok) {
    const data = await resp.json();
    sheets.push({ id: data.id, name: data.name });
    sheetId = data.id;
    elements = [];
    
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

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
        (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
      inside = !inside;
    }
  }
  return inside;
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
    
    // Add all points from all element types
    if (e.points) {
      // All elements now use points array
      if (e.type === "Support") {
        e.points.forEach((p, i) => {
          pts.push({ ...p, kind: "Support" });
        });
      } else if (e.type === "Load") {
        e.points.forEach((p, i) => {
          pts.push({ ...p, kind: "Load" });
        });
      } else if (e.type === "Member" || e.type === "Cable") {
        e.points.forEach((p, i) => {
          pts.push({ ...p, kind: "End" });
        });
        
        // Add midpoint of member/cable
        if (e.points.length >= 2) {
          const midX = (e.points[0].x + e.points[1].x) / 2;
          const midY = (e.points[0].y + e.points[1].y) / 2;
          const midZ = (e.points[0].z + e.points[1].z) / 2;
          pts.push({ x: midX, y: midY, z: midZ, kind: "Midpoint" });
        }
      } else if (e.type === "Plane") {
        // Point-based plane
        e.points.forEach((p, i) => {
          pts.push({ ...p, kind: "PlaneCorner" });
        });
        
        // Add edge midpoints
        const edges = [
          [0, 1], [1, 2], [2, 3], [3, 0]
        ];
        edges.forEach(([i, j]) => {
          const midX = (e.points[i].x + e.points[j].x) / 2;
          const midY = (e.points[i].y + e.points[j].y) / 2;
          const midZ = (e.points[i].z + e.points[j].z) / 2;
          pts.push({ x: midX, y: midY, z: midZ, kind: "PlaneEdgeMid" });
        });
        
        // Add center of plane
        const centerX = e.points.reduce((sum, p) => sum + p.x, 0) / e.points.length;
        const centerY = e.points.reduce((sum, p) => sum + p.y, 0) / e.points.length;
        const centerZ = e.points.reduce((sum, p) => sum + p.z, 0) / e.points.length;
        pts.push({ x: centerX, y: centerY, z: centerZ, kind: "PlaneCenter" });
      } else if (e.type === "Solid") {
        // Point-based solid
        e.points.forEach((p, i) => {
          pts.push({ ...p, kind: "SolidCorner" });
        });
        
        // Add edge midpoints
        const edges = [
          [0, 1], [1, 2], [2, 3], [3, 0], // bottom face
          [4, 5], [5, 6], [6, 7], [7, 4], // top face
          [0, 4], [1, 5], [2, 6], [3, 7]  // connecting edges
        ];
        edges.forEach(([i, j]) => {
          const midX = (e.points[i].x + e.points[j].x) / 2;
          const midY = (e.points[i].y + e.points[j].y) / 2;
          const midZ = (e.points[i].z + e.points[j].z) / 2;
          pts.push({ x: midX, y: midY, z: midZ, kind: "SolidEdgeMid" });
        });
        
        // Add face centers
        const faces = [
          [0, 1, 2, 3], // bottom face
          [4, 5, 6, 7], // top face
          [0, 1, 5, 4], // front face
          [2, 3, 7, 6], // back face
          [0, 3, 7, 4], // left face
          [1, 2, 6, 5]  // right face
        ];
        faces.forEach((face, faceIndex) => {
          const centerX = face.reduce((sum, i) => sum + e.points[i].x, 0) / face.length;
          const centerY = face.reduce((sum, i) => sum + e.points[i].y, 0) / face.length;
          const centerZ = face.reduce((sum, i) => sum + e.points[i].z, 0) / face.length;
          pts.push({ x: centerX, y: centerY, z: centerZ, kind: "SolidFaceCenter" });
        });
        
        // Add center of solid
        const centerX = e.points.reduce((sum, p) => sum + p.x, 0) / e.points.length;
        const centerY = e.points.reduce((sum, p) => sum + p.y, 0) / e.points.length;
        const centerZ = e.points.reduce((sum, p) => sum + p.z, 0) / e.points.length;
        pts.push({ x: centerX, y: centerY, z: centerZ, kind: "SolidCenter" });
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
      } else if (e.type === "Member" || e.type === "Cable") {
      pts.push({ x: e.x, y: e.y, z: e.z, kind: "End" });
      pts.push({ x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z, kind: "End" });
        
        // Add midpoint of member/cable
        const midX = (e.x + (e.x2 ?? e.x)) / 2;
        const midY = (e.y + (e.y2 ?? e.y)) / 2;
        const midZ = (e.z + (e.z2 ?? e.z)) / 2;
        pts.push({ x: midX, y: midY, z: midZ, kind: "Midpoint" });
      } else if (e.type === "Plane") {
        // Legacy dimension-based plane
        const corners = planeCorners(e);
        corners.forEach((c) => pts.push({ ...c, kind: "PlaneCorner" }));
      } else if (e.type === "Solid") {
        // Legacy dimension-based solid
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
    }
  });
  return pts;
}

function getSnapLines(ignoreId) {
  const lines = [];
  elements.forEach((e) => {
    if (e.id === ignoreId) return;
    if (e.points && e.points.length >= 2) {
      // All elements now use points array
      if (e.type === "Member" || e.type === "Cable" || e.type === "Load") {
        lines.push({
          p1: { x: e.points[0].x, y: e.points[0].y, z: e.points[0].z },
          p2: { x: e.points[1].x, y: e.points[1].y, z: e.points[1].z },
        });
      }
    } else {
      // Legacy fallback for any remaining elements
    if (e.type === "Member" || e.type === "Cable" || e.type === "Load") {
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
    if (el.type === "Plane" || el.type === "Solid") {
      // For planes and solids, maintain object integrity by moving the entire object
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
        el.points.forEach(p => {
          p.x += offsetX;
          p.y += offsetY;
          p.z += offsetZ;
        });
      }
    } else {
      // For other elements (Member, Cable, Load, Support), snap each point individually
      el.points.forEach(p => snapObj(p));
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
    } else if (el.type === "Plane" || el.type === "Solid") {
      snapObj(el);
  } else {
      snapObj(el);
    }
  }
}

function addNumberInput(container, label, prop, el, unitType = null, pointIndex = -1) {
  const div = document.createElement("div");
  div.className = "mb-2";
  
  // Get current value and format with units if applicable
  let currentValue = pointIndex > -1 ? el.points[pointIndex][prop] : (el[prop] ?? 0);
  let displayValue = currentValue;
  let unitSymbol = "";
  
  if (unitType) {
    const unitSystem = globalProps.units || "metric";
    if (unitType === "length") {
      unitSymbol = unitSystem === "metric" ? "mm" : "in";
      displayValue = unitSystem === "metric" ? (currentValue * 1000).toFixed(3) : (currentValue * 39.3701).toFixed(3);
    } else if (unitType === "force") {
      unitSymbol = unitSystem === "metric" ? "kN" : "kip";
      displayValue = unitSystem === "metric" ? (currentValue / 1000).toFixed(3) : (currentValue / 4448.22).toFixed(3);
    } else if (unitType === "stress") {
      unitSymbol = unitSystem === "metric" ? "GPa" : "ksi";
      displayValue = unitSystem === "metric" ? (currentValue / 1e9).toFixed(3) : (currentValue / 6894760.0).toFixed(3);
    } else if (unitType === "area") {
      unitSymbol = unitSystem === "metric" ? "mm²" : "in²";
      displayValue = unitSystem === "metric" ? (currentValue * 1e6).toFixed(3) : (currentValue * 1550.0031).toFixed(3);
    } else if (unitType === "moment_of_inertia") {
      unitSymbol = unitSystem === "metric" ? "mm⁴" : "in⁴";
      displayValue = unitSystem === "metric" ? (currentValue * 1e12).toFixed(3) : (currentValue * 2.4025e9).toFixed(3);
    } else if (unitType === "acceleration") {
      unitSymbol = unitSystem === "metric" ? "m/s²" : "ft/s²";
      displayValue = unitSystem === "metric" ? currentValue.toFixed(3) : (currentValue * 3.28084).toFixed(3);
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
  input.addEventListener("input", (ev) => {
    const text = ev.target.value;
    let v;
    
    if (unitType) {
      try {
        // Parse value without units (units are now in static label)
        const unitSystem = globalProps.units || "metric";
        if (unitType === "length") {
          v = parseFloat(text);
          if (unitSystem === "metric") {
            v = v / 1000; // Convert mm to m
          } else {
            v = v / 39.3701; // Convert in to m
          }
        } else if (unitType === "force") {
          v = parseFloat(text);
          if (unitSystem === "metric") {
            v = v * 1000; // Convert kN to N
          } else {
            v = v * 4448.22; // Convert kip to N
          }
        } else if (unitType === "stress") {
          v = parseFloat(text);
          if (unitSystem === "metric") {
            v = v * 1e9; // Convert GPa to Pa
          } else {
            v = v * 6894760.0; // Convert ksi to Pa
          }
        } else if (unitType === "area") {
          v = parseFloat(text);
          if (unitSystem === "metric") {
            v = v / 1e6; // Convert mm² to m²
          } else {
            v = v / 1550.0031; // Convert in² to m²
          }
        } else if (unitType === "moment_of_inertia") {
          v = parseFloat(text);
          if (unitSystem === "metric") {
            v = v / 1e12; // Convert mm⁴ to m⁴
          } else {
            v = v / 2.4025e9; // Convert in⁴ to m⁴
          }
        } else if (unitType === "acceleration") {
          v = parseFloat(text);
          if (unitSystem === "metric") {
            v = v; // Already in m/s²
          } else {
            v = v / 3.28084; // Convert ft/s² to m/s²
          }
        }
      } catch (e) {
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
      
      // Show points for all element types
      if (el.points) {
        el.points.forEach((p, i) => {
          form.innerHTML += `<div class="mb-2 fw-bold">Point ${i+1}</div>`;
          ["x", "y", "z"].forEach(coord => addNumberInput(form, coord, coord, el, "length", i));
        });
      }
      
      if (el.type === "Member" || el.type === "Cable") {
        addNumberInput(form, "Young's Modulus (E)", "E", el, "stress");
        addNumberInput(form, "Cross Sectional Area (A)", "A", el, "area");
        addNumberInput(form, "Second Moment of Inertia (I)", "I", el, "moment_of_inertia");
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
        addNumberInput(form, "amount", "amount", el, "force");
      }
      pane.appendChild(form);
      document.getElementById("delete-btn").disabled = false;
    }
  } else {
    document.getElementById("delete-btn").disabled = true;
  }

  const globalDiv = document.createElement("div");
  globalDiv.innerHTML = `<hr><h6>Global</h6>
    <div class='mb-2'><label class='form-label'>Units</label><select id='global-units' class='form-select form-select-sm'>
      <option value='metric'>Metric</option><option value='imperial'>Imperial</option></select></div>`;
  pane.appendChild(globalDiv);
  
  // Add gravity input with units
  const gravityDiv = document.createElement("div");
  gravityDiv.className = "mb-2";
  const unitSystem = globalProps.units || "metric";
  const gravityUnit = unitSystem === "metric" ? "m/s²" : "ft/s²";
  const gravityValue = unitSystem === "metric" ? globalProps.g.toFixed(3) : (globalProps.g * 3.28084).toFixed(3);
  
  gravityDiv.innerHTML = `
    <label class='form-label'>Gravity (g)</label>
    <div class='input-group input-group-sm'>
      <input id='global-g' class='form-control' type='text' value='${gravityValue}'>
      <span class='input-group-text'>${gravityUnit}</span>
    </div>
  `;
  pane.appendChild(gravityDiv);
  
  const gInput = gravityDiv.querySelector("#global-g");
  gInput.addEventListener("input", (ev) => {
    const text = ev.target.value;
    let v = parseFloat(text);
    
    if (Number.isFinite(v)) {
      const unitSystem = globalProps.units || "metric";
      if (unitSystem === "metric") {
        globalProps.g = v; // Already in m/s²
      } else {
        globalProps.g = v / 3.28084; // Convert ft/s² to m/s²
      }
    }
  });
  
  const sel = globalDiv.querySelector("#global-units");
  sel.value = globalProps.units;
  sel.addEventListener("change", (ev) => {
    const old = globalProps.units;
    globalProps.units = ev.target.value;
    if (old !== globalProps.units) {
      // Convert gravity value
      if (globalProps.units === "metric") {
        globalProps.g = 9.81; // m/s²
      } else {
        globalProps.g = 32.174; // ft/s²
      }
      // Re-render properties to update unit displays
    renderProperties();
    }
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

  // First, render all points as dots
  const pointMap = new Map();
  elements.forEach((el) => {
    if (el.points) {
      // All elements now use points array
      el.points.forEach((p, i) => {
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
      } else if (el.type === "Member" || el.type === "Cable") {
        const key1 = `${el.x.toFixed(6)},${el.y.toFixed(6)},${el.z.toFixed(6)}`;
        const key2 = `${(el.x2 ?? el.x).toFixed(6)},${(el.y2 ?? el.y).toFixed(6)},${(el.z2 ?? el.z).toFixed(6)}`;
        if (!pointMap.has(key1)) {
          pointMap.set(key1, { x: el.x, y: el.y, z: el.z, type: "Member" });
        }
        if (!pointMap.has(key2)) {
          pointMap.set(key2, { x: el.x2 ?? el.x, y: el.y2 ?? el.y, z: el.z2 ?? el.z, type: "Member" });
        }
      } else if (el.type === "Plane" || el.type === "Solid") {
        (el.points || []).forEach(p => {
          const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
          if (!pointMap.has(key)) {
            pointMap.set(key, { ...p, type: el.type });
          }
        });
      }
    }
  });

  // Render points as dots
  pointMap.forEach((point, key) => {
    const p = projectPoint({ x: point.x, y: point.y, z: point.z });
    const sx = cx + (p.x || 0) * zoom;
    const sy = cy + (p.y || 0) * zoom;
    
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", sx);
    dot.setAttribute("cy", sy);
    dot.setAttribute("r", 3 * zoom);
    dot.setAttribute("fill", point.type === "Support" ? "green" : "blue");
    dot.setAttribute("stroke", "black");
    dot.setAttribute("stroke-width", 1);
    svg.appendChild(dot);
  });

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
      const p1 = projectPoint(el.points[0]);
      const p2 = projectPoint(el.points[1]);
      shape = document.createElementNS("http://www.w3.org/2000/svg", "line");
      shape.setAttribute("x1", cx + (p1.x || 0) * zoom);
      shape.setAttribute("y1", cy + (p1.y || 0) * zoom);
      shape.setAttribute("x2", cx + (p2.x || 0) * zoom);
      shape.setAttribute("y2", cy + (p2.y || 0) * zoom);
      shape.setAttribute("stroke", "blue");
      shape.setAttribute("stroke-width", 2);
      if (el.type === "Cable") shape.setAttribute("stroke-dasharray", "4 2");
    } else if (el.type === "Load") {
      // Treat loads like members with draggable endpoints
      const p1 = projectPoint(el.points[0]);
      const p2 = projectPoint(el.points[1]);
      shape = document.createElementNS("http://www.w3.org/2000/svg", "line");
      shape.setAttribute("x1", cx + (p1.x || 0) * zoom);
      shape.setAttribute("y1", cy + (p1.y || 0) * zoom);
      shape.setAttribute("x2", cx + (p2.x || 0) * zoom);
      shape.setAttribute("y2", cy + (p2.y || 0) * zoom);
      shape.setAttribute("stroke", "red");
      shape.setAttribute("stroke-width", 2);
      
      // Add arrowhead at the end point
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const arrowSize = 6 * zoom;
      const b1x = cx + (p2.x || 0) * zoom + nx * arrowSize;
      const b1y = cy + (p2.y || 0) * zoom + ny * arrowSize;
      const b2x = cx + (p2.x || 0) * zoom - nx * arrowSize;
      const b2y = cy + (p2.y || 0) * zoom - ny * arrowSize;
      const tx = cx + (p2.x || 0) * zoom + (dx / len) * arrowSize * 1.5;
      const ty = cy + (p2.y || 0) * zoom + (dy / len) * arrowSize * 1.5;
      
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      arrow.setAttribute("points", `${b1x},${b1y} ${b2x},${b2y} ${tx},${ty}`);
      arrow.setAttribute("fill", "red");
      g.appendChild(arrow);
      } else if (el.type === "Plane") {
      // Always render planes - they should be visible in all views
      const pts = el.points.map((p) => {
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
      const vertices = el.points;
      const screen_vertices = vertices.map(p => screenCoords(p));
      
      // Define the 6 faces of the cube
      const faces = [
        [0, 1, 2, 3], // bottom face
        [4, 5, 6, 7], // top face
        [0, 1, 5, 4], // front face
        [2, 3, 7, 6], // back face
        [0, 3, 7, 4], // left face
        [1, 2, 6, 5]  // right face
      ];

      // Render each face as a transparent polygon
      faces.forEach(face => {
        const facePoints = face.map(i => screen_vertices[i]);
        const shape = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        shape.setAttribute("points", facePoints.map(p => `${p.x},${p.y}`).join(" "));
        shape.setAttribute("fill", "rgba(0,0,255,0.3)");
        shape.setAttribute("stroke", "blue");
        shape.setAttribute("stroke-width", 1);
        g.appendChild(shape);
      });
      
      // Also render edges for better definition
      const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0], // bottom face
        [4, 5], [5, 6], [6, 7], [7, 4], // top face
        [0, 4], [1, 5], [2, 6], [3, 7]  // connecting edges
      ];

      edges.forEach(edge => {
        const p1 = screen_vertices[edge[0]];
        const p2 = screen_vertices[edge[1]];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", p1.x);
        line.setAttribute("y1", p1.y);
        line.setAttribute("x2", p2.x);
        line.setAttribute("y2", p2.y);
        line.setAttribute("stroke", "blue");
        line.setAttribute("stroke-width", 1);
        g.appendChild(line);
      });
      } else if (el.type === "Support") {
        shape = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "polygon",
        );
      const p = projectPoint(el.points[0]);
      const sx = cx + (p.x || 0) * zoom;
      const sy = cy + (p.y || 0) * zoom;
        shape.setAttribute(
          "points",
          `${sx - 6 * zoom},${sy + 10 * zoom} ${sx + 6 * zoom},${sy + 10 * zoom} ${sx},${sy}`,
        );
        shape.setAttribute("fill", "green");
    }
    if (shape) g.appendChild(shape);
    if (el.id === selectedId) g.setAttribute("stroke", "orange");
    svg.appendChild(g);
  });

  // Render calculation results on top
  renderCalculationResults();

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
    const endX = base.x + (dir.x || 0);
    const endY = base.y + (dir.y || 0);
    const endZ = base.z + (dir.z || 0);
    
    base.points = [
      { x: base.x, y: base.y, z: base.z },
      { x: endX, y: endY, z: endZ }
    ];
    base.E = 200e9;
    base.A = 0.01;
    base.I = 1e-6;
  } else if (type === "Plane") {
    // Create plane with 4 corner points
    const l = 40 / 2; // half length
    const w = 40 / 2; // half width
    const normal = currentView === "continuous" ? "Z" : currentView[1];
    
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
    } else { // Z normal
      points = [
        { x: base.x - l, y: base.y - w, z: base.z },
        { x: base.x + l, y: base.y - w, z: base.z },
        { x: base.x + l, y: base.y + w, z: base.z },
        { x: base.x - l, y: base.y + w, z: base.z },
      ];
    }
    
    base.points = points;
    base.normal = normal;
  } else if (type === "Solid") {
    // Create solid with 8 corner points - orthogonal to standard axes
    const w = 30 / 2; // half width
    const h = 30 / 2; // half height  
    const d = 30 / 2; // half depth
    
    base.points = [
      { x: base.x - w, y: base.y - h, z: base.z - d }, // 0: bottom-back-left
      { x: base.x + w, y: base.y - h, z: base.z - d }, // 1: bottom-back-right
      { x: base.x + w, y: base.y + h, z: base.z - d }, // 2: bottom-front-right
      { x: base.x - w, y: base.y + h, z: base.z - d }, // 3: bottom-front-left
      { x: base.x - w, y: base.y - h, z: base.z + d }, // 4: top-back-left
      { x: base.x + w, y: base.y - h, z: base.z + d }, // 5: top-back-right
      { x: base.x + w, y: base.y + h, z: base.z + d }, // 6: top-front-right
      { x: base.x - w, y: base.y + h, z: base.z + d }, // 7: top-front-left
    ];
  } else if (type === "Load") {
    const dir = unprojectDelta(0, -20);
    const endX = base.x + (dir.x || 0);
    const endY = base.y + (dir.y || 0);
    const endZ = base.z + (dir.z || 0);
    
    base.points = [
      { x: base.x, y: base.y, z: base.z },
      { x: endX, y: endY, z: endZ }
    ];
    base.amount = 20;
  } else if (type === "Support") {
    base.points = [
      { x: base.x, y: base.y, z: base.z }
    ];
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
    const p1 = screenCoords(el.points[0]);
    const p2 = screenCoords(el.points[1]);
    if (distanceScreen({ x: mx, y: my }, p1) < 8) dragMode = "start";
    else if (distanceScreen({ x: mx, y: my }, p2) < 8) dragMode = "end";
    else if (distanceToSegment2D({ x: mx, y: my }, p1, p2) < 6)
      dragMode = "body";
  } else if (el.type === "Load") {
    const p1 = screenCoords(el.points[0]);
    const p2 = screenCoords(el.points[1]);
    if (distanceScreen({ x: mx, y: my }, p1) < 8) dragMode = "start";
    else if (distanceScreen({ x: mx, y: my }, p2) < 8) dragMode = "end";
    else if (distanceToSegment2D({ x: mx, y: my }, p1, p2) < 6)
      dragMode = "body";
  } else if (el.type === "Plane" || el.type === "Solid") {
    // Check for edge/face dragging instead of individual points
    if (el.type === "Plane") {
      // For planes, check for edge dragging
      const pts = (el.points || []).map(p => screenCoords(p));
      if (pts.length >= 4) {
        const edges = [
          [pts[0], pts[1]], // edge 0-1
          [pts[1], pts[2]], // edge 1-2
          [pts[2], pts[3]], // edge 2-3
          [pts[3], pts[0]]  // edge 3-0
        ];
        
        for (let i = 0; i < edges.length; i++) {
          const edge = edges[i];
          const distance = distanceToSegment2D({ x: mx, y: my }, edge[0], edge[1]);
          if (distance < 8) {
            dragMode = `edge-${i}`;
            break;
          }
        }
      }
    } else if (el.type === "Solid") {
      // For solids, check for face dragging
      const vertices = solidVertices(el);
      const screen_vertices = vertices.map(p => screenCoords(p));
      
      // Define the 6 faces of the cube
      const faces = [
        [0, 1, 2, 3], // bottom face
        [4, 5, 6, 7], // top face
        [0, 1, 5, 4], // front face
        [2, 3, 7, 6], // back face
        [0, 3, 7, 4], // left face
        [1, 2, 6, 5]  // right face
      ];
      
      for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const facePoints = face.map(j => screen_vertices[j]);
        
        // Check if mouse is inside the face polygon
        if (isPointInPolygon({ x: mx, y: my }, facePoints)) {
          dragMode = `face-${i}`;
          break;
        }
      }
    }
    
    // If no edge/face was clicked, allow body drag
    if (dragMode === "body") {
      // Check for edge dragging for legacy dimension-based elements
      if (!el.points) {
        const rect = el.type === "Plane" ? planeScreenRect(el) : solidScreenRect(el);
        const edgeThreshold = 8;
        
        // Check if mouse is near edges for resizing
        if (Math.abs(mx - rect.left) < edgeThreshold) dragMode = "left";
        else if (Math.abs(mx - rect.right) < edgeThreshold) dragMode = "right";
        else if (Math.abs(my - rect.top) < edgeThreshold) dragMode = "top";
        else if (Math.abs(my - rect.bottom) < edgeThreshold) dragMode = "bottom";
      }
    }
  } else {
    dragMode = "body";
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
          [3, 0]  // edge 3-0
        ];
        
        if (edgeIndex < edges.length) {
          const [p1Index, p2Index] = edges[edgeIndex];
          const p1 = el.points[p1Index];
          const p2 = el.points[p2Index];
          const orig_p1 = dragOrig.points[p1Index];
          const orig_p2 = dragOrig.points[p2Index];
          
          // Apply orthogonal constraint
          const constrainedDelta = constrainToOrthogonal(delta, edgeIndex, "Plane");
          
          // Move both points of the edge
          p1.x = orig_p1.x + (constrainedDelta.x || 0);
          p1.y = orig_p1.y + (constrainedDelta.y || 0);
          p1.z = orig_p1.z + (constrainedDelta.z || 0);
          p2.x = orig_p2.x + (constrainedDelta.x || 0);
          p2.y = orig_p2.y + (constrainedDelta.y || 0);
          p2.z = orig_p2.z + (constrainedDelta.z || 0);
        }
      } else {
        // Body drag - move all points
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
  } else if (el.type === "Solid") {
    if (el.points) {
      // Point-based solid with face dragging
      if (dragMode.startsWith("face-")) {
        const faceIndex = parseInt(dragMode.split("-")[1], 10);
        const faces = [
          [0, 1, 2, 3], // bottom face
          [4, 5, 6, 7], // top face
          [0, 1, 5, 4], // front face
          [2, 3, 7, 6], // back face
          [0, 3, 7, 4], // left face
          [1, 2, 6, 5]  // right face
        ];
        
        if (faceIndex < faces.length) {
          const facePoints = faces[faceIndex];
          
          // Apply orthogonal constraint
          const constrainedDelta = constrainToOrthogonal(delta, faceIndex, "Solid");
          
          // Move all points of the face
          facePoints.forEach(pointIndex => {
            const p = el.points[pointIndex];
            const orig_p = dragOrig.points[pointIndex];
            p.x = orig_p.x + (constrainedDelta.x || 0);
            p.y = orig_p.y + (constrainedDelta.y || 0);
            p.z = orig_p.z + (constrainedDelta.z || 0);
          });
        }
      } else {
        // Body drag - move all points
        el.points.forEach((p, i) => {
          const orig_p = dragOrig.points[i];
          p.x = orig_p.x + (delta.x || 0);
          p.y = orig_p.y + (delta.y || 0);
          p.z = orig_p.z + (delta.z || 0);
        });
      }
    } else {
      // Legacy dimension-based solid
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
  } else if (el.points) { // body drag for point-based elements
    el.points.forEach((p, i) => {
      const orig_p = dragOrig.points[i];
      p.x = orig_p.x + (delta.x || 0);
      p.y = orig_p.y + (delta.y || 0);
      p.z = orig_p.z + (delta.z || 0);
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
        if (e.points) {
          // New point-based format
          obj.points = e.points;
        obj.E = e.E ?? 200e9;
        obj.A = e.A ?? 0.01;
        obj.I = e.I ?? 1e-6;
        } else {
          // Legacy format - convert to points
          obj.points = [
            { x: e.x, y: e.y, z: e.z },
            { x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z }
          ];
          obj.E = e.E ?? 200e9;
          obj.A = e.A ?? 0.01;
          obj.I = e.I ?? 1e-6;
        }
      } else if (obj.type === "Plane") {
        if (e.points) {
          // Point-based plane
          obj.points = e.points;
          obj.normal = e.normal;
        } else {
          // Legacy dimension-based plane
        obj.length = e.length ?? 40;
        obj.width = e.width ?? 40;
        obj.normal = e.normal ?? currentView[1];
        }
      } else if (obj.type === "Solid") {
        if (e.points) {
          // Point-based solid
          obj.points = e.points;
        } else {
          // Legacy dimension-based solid
        obj.width = e.width ?? 30;
        obj.height = e.height ?? 30;
        obj.depth = e.depth ?? 30;
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
            { x: e.x2 ?? e.x, y: e.y2 ?? e.y, z: e.z2 ?? e.z }
          ];
          obj.amount = e.amount ?? Math.hypot(obj.x2 - obj.x, obj.y2 - obj.y, obj.z2 - obj.z);
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
          obj.points = [
            { x: e.x, y: e.y, z: e.z }
          ];
        obj.ux = e.ux !== false;
        obj.uy = e.uy !== false;
        obj.rz = e.rz !== false;
        }
      }
      return obj;
    });
    let maxId = elements.reduce((m, e) => Math.max(m, e.id), 0);
    nextId = Math.max(Date.now(), maxId + 1);
    
    // Clear calculation results when loading a new sheet
    lastCalculationResults = null;
    
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
  // Collect all referenced points (by id or coordinates)
  const referenced = new Set();
  // Map from coordinate string to point object
  const coordToPointObj = new Map();
  // Map from coordinate string to id
  const coordToId = new Map();
  let nextPointId = 1;

  // First, collect all points from all elements, but only mark as referenced if used by a member, support, or as the application point of a load
  elements.forEach((el) => {
    if (el.type === "Member" || el.type === "Cable") {
      if (el.points) {
        el.points.forEach((p) => {
          const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
          coordToPointObj.set(key, p);
          referenced.add(key);
        });
      }
    } else if (el.type === "Support") {
      if (el.points) {
        const p = el.points[0];
        const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
        coordToPointObj.set(key, p);
        referenced.add(key);
      }
    } else if (el.type === "Load") {
      if (el.points) {
        // Only the first point is the application point
        const p = el.points[0];
        const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
        coordToPointObj.set(key, p);
        referenced.add(key);
        // The second point is direction only, do not add to referenced
        if (el.points[1]) {
          const key2 = `${el.points[1].x.toFixed(6)},${el.points[1].y.toFixed(6)},${el.points[1].z.toFixed(6)}`;
          coordToPointObj.set(key2, el.points[1]);
        }
      }
    } else if (el.type === "Plane" || el.type === "Solid") {
      if (el.points) {
        el.points.forEach((p) => {
          const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
          coordToPointObj.set(key, p);
        });
      }
    }
  });

  // Assign ids only to referenced points
  Array.from(referenced).forEach((key) => {
    if (!coordToId.has(key)) {
      coordToId.set(key, nextPointId++);
    }
  });

  // Build points array for the model
  const points = Array.from(referenced).map((key) => {
    const p = coordToPointObj.get(key);
    return { id: coordToId.get(key), x: p.x, y: p.y, z: p.z };
  });

  // Helper to get id for a coordinate
  function getPointId(x, y, z = 0) {
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    return coordToId.get(key);
  }

  const members = elements
    .filter((e) => e.type === "Member" || e.type === "Cable")
    .map((e) => {
      if (e.points) {
        return {
          start: getPointId(e.points[0].x, e.points[0].y, e.points[0].z),
          end: getPointId(e.points[1].x, e.points[1].y, e.points[1].z),
          E: e.E ?? 200e9,
          A: e.A ?? 0.01,
          I: e.I ?? 1e-6,
        };
      }
    });

  const loads = elements
    .filter((e) => e.type === "Load")
    .map((e) => {
      if (e.points) {
        const dx = e.points[1].x - e.points[0].x;
        const dy = e.points[1].y - e.points[0].y;
        const dz = e.points[1].z - e.points[0].z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const amt = e.amount ?? 0;
        return {
          point: getPointId(e.points[0].x, e.points[0].y, e.points[0].z),
          fx: (amt * dx) / len,
          fy: (amt * dy) / len,
          mz: 0,
          amount: amt,
        };
      }
    });

  const supports = elements
    .filter((e) => e.type === "Support")
    .map((e) => {
      if (e.points) {
        return {
          point: getPointId(e.points[0].x, e.points[0].y, e.points[0].z),
          ux: e.ux !== false,
          uy: e.uy !== false,
          rz: e.rz !== false,
        };
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
    unit_system: data.unit_system
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
      const point = payload.points.find(p => p.id === parseInt(pointId));
      if (point) {
        lines.push(`  Point ${pointId} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}):`);
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
      const point = payload.points.find(p => p.id === parseInt(pointId));
      if (point) {
        lines.push(`  Point ${pointId} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}, ${point.z.toFixed(3)}):`);
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
    for (let i = 0; i < payload.loads.length; i++) {
      const load = payload.loads[i];
      const point = payload.points.find(p => p.id === load.point);
      if (point) {
        const magnitude = Math.sqrt(load.fx * load.fx + load.fy * load.fy);
        const angle = Math.atan2(load.fy, load.fx) * 180 / Math.PI;
        const unitSystem = data.unit_system || "metric";
        const forceUnit = unitSystem === "metric" ? "kN" : "kip";
        const magnitudeFormatted = unitSystem === "metric" ? 
          (magnitude / 1000).toFixed(6) : (magnitude / 4448.22).toFixed(6);
        
        lines.push(`  Load ${i + 1} at Point ${load.point} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}):`);
        lines.push(`    Magnitude: ${magnitudeFormatted} ${forceUnit}`);
        lines.push(`    Direction: ${angle.toFixed(2)}° from horizontal`);
        lines.push(`    Components: fx = ${load.fx.toFixed(6)} N, fy = ${load.fy.toFixed(6)} N`);
        lines.push("");
      }
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
      const point = payload.points.find(p => p.id === support.point);
      if (point) {
        const constraints = [];
        if (support.ux) constraints.push("ux");
        if (support.uy) constraints.push("uy");
        if (support.rz) constraints.push("rz");
        lines.push(`  Support ${i + 1} at Point ${support.point} (${point.x.toFixed(3)}, ${point.y.toFixed(3)}):`);
        lines.push(`    Constraints: ${constraints.length > 0 ? constraints.join(", ") : "none"}`);
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
      const startPoint = payload.points.find(p => p.id === member.start);
      const endPoint = payload.points.find(p => p.id === member.end);
      if (startPoint && endPoint) {
        const length = Math.sqrt(
          Math.pow(endPoint.x - startPoint.x, 2) + 
          Math.pow(endPoint.y - startPoint.y, 2)
        );
        const unitSystem = data.unit_system || "metric";
        const lengthUnit = unitSystem === "metric" ? "mm" : "in";
        const lengthFormatted = unitSystem === "metric" ? 
          (length * 1000).toFixed(6) : (length * 39.3701).toFixed(6);
        const stressUnit = unitSystem === "metric" ? "GPa" : "ksi";
        const EFormatted = unitSystem === "metric" ? 
          (member.E / 1e9).toFixed(3) : (member.E / 6894760.0).toFixed(3);
        const areaUnit = unitSystem === "metric" ? "mm²" : "in²";
        const AFormatted = unitSystem === "metric" ? 
          (member.A * 1e6).toFixed(3) : (member.A * 1550.0031).toFixed(3);
        const inertiaUnit = unitSystem === "metric" ? "mm⁴" : "in⁴";
        const IFormatted = unitSystem === "metric" ? 
          (member.I * 1e12).toFixed(3) : (member.I * 2.4025e9).toFixed(3);
        
        lines.push(`  Member ${i + 1} (Points ${member.start} → ${member.end}):`);
        lines.push(`    Length: ${lengthFormatted} ${lengthUnit}`);
        lines.push(`    Young's Modulus (E): ${EFormatted} ${stressUnit}`);
        lines.push(`    Cross-sectional Area (A): ${AFormatted} ${areaUnit}`);
        lines.push(`    Second Moment of Inertia (I): ${IFormatted} ${inertiaUnit}`);
        lines.push("");
      }
    }
  }
  
  out.textContent = lines.join("\n");
  
  // Re-render to show calculation results
  render(false);
}

document.getElementById("solve-btn").addEventListener("click", solveModel);

// Global variable to store the last calculation results
let lastCalculationResults = null;

// Unified function to render force vectors with consistent scaling
function renderForceVector(group, startX, startY, endX, endY, color, opacity = 1.0) {
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
  const arrowSize = 6 * zoom;
  const b1x = endX + nx * arrowSize;
  const b1y = endY + ny * arrowSize;
  const b2x = endX - nx * arrowSize;
  const b2y = endY - ny * arrowSize;
  const tx = endX + (dx / len) * arrowSize * 1.5;
  const ty = endY + (dy / len) * arrowSize * 1.5;
  
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  arrow.setAttribute("points", `${b1x},${b1y} ${b2x},${b2y} ${tx},${ty}`);
  arrow.setAttribute("fill", color);
  arrow.setAttribute("opacity", opacity);
  group.appendChild(arrow);
}

// Function to render calculation results on the plot
function renderCalculationResults() {
  if (!lastCalculationResults) return;
  
  const svg = document.getElementById("canvas");
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 + panX;
  const cy = rect.height / 2 + panY;
  
  const { displacements, reactions, points } = lastCalculationResults;
  
  // Create a group for calculation results
  const resultsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  resultsGroup.setAttribute("class", "calculation-results");
  svg.appendChild(resultsGroup);
  
  // Render reaction force vectors
  Object.entries(reactions || {}).forEach(([pointId, v]) => {
    const point = points.find(p => p.id === parseInt(pointId));
    if (!point) return;
    
    let fx, fy, mz;
    
    // Handle different response formats
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) {
        // Direct array format
        [fx, fy, mz] = v;
      } else if (v.raw && Array.isArray(v.raw)) {
        // New format with raw values
        [fx, fy, mz] = v.raw;
      } else if (v.fx !== undefined && v.fy !== undefined && v.mz !== undefined) {
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
}

loadState();

function solidVertices(el) {
  // If the solid is defined by points, return them directly
  if (el.points) {
    return el.points;
  }
  
  // Legacy: if not point-based, calculate from dimensions
  const w = (el.width ?? 30) / 2;
  const h = (el.height ?? 30) / 2;
  const d = (el.depth ?? 30) / 2;
  return [
    { x: el.x - w, y: el.y - h, z: el.z - d },
    { x: el.x + w, y: el.y - h, z: el.z - d },
    { x: el.x + w, y: el.y + h, z: el.z - d },
    { x: el.x - w, y: el.y + h, z: el.z - d },
    { x: el.x - w, y: el.y - h, z: el.z + d },
    { x: el.x + w, y: el.y - h, z: el.z + d },
    { x: el.x + w, y: el.y + h, z: el.z + d },
    { x: el.x - w, y: el.y + h, z: el.z + d },
  ];
}

function constrainToOrthogonal(delta, faceIndex, elementType) {
  // For planes: constrain edge movements to be orthogonal
  // For solids: constrain face movements to be orthogonal
  const constrained = { x: 0, y: 0, z: 0 };
  
  if (elementType === "Plane") {
    // Plane edges: constrain to the two axes that define the edge
    const edgeAxes = [
      ["y", "z"], // edge 0-1: Y-Z plane
      ["x", "z"], // edge 1-2: X-Z plane  
      ["y", "z"], // edge 2-3: Y-Z plane
      ["x", "z"]  // edge 3-0: X-Z plane
    ];
    
    if (faceIndex < edgeAxes.length) {
      const axes = edgeAxes[faceIndex];
      axes.forEach(axis => {
        constrained[axis] = delta[axis] || 0;
      });
    }
  } else if (elementType === "Solid") {
    // Solid faces: constrain to the axis normal to the face
    const faceAxes = [
      "z", // bottom face: move in Z direction
      "z", // top face: move in Z direction
      "y", // front face: move in Y direction
      "y", // back face: move in Y direction
      "x", // left face: move in X direction
      "x"  // right face: move in X direction
    ];
    
    if (faceIndex < faceAxes.length) {
      const axis = faceAxes[faceIndex];
      constrained[axis] = delta[axis] || 0;
    }
  }
  
  return constrained;
}
