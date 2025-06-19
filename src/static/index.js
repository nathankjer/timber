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
// Use `var` so `currentView` becomes a property of the global object.
// This allows tests (which run the file in a VM sandbox) to mutate
// `currentView` by assigning to `global.currentView`.
var currentView = "+X";

function setCurrentView(view) {
  currentView = view;
}
let zoom = 1;
let panX = 0;
let panY = 0;
let panStartX = 0;
let panStartY = 0;
let panOrigX = 0;
let panOrigY = 0;
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
}

function unprojectDelta(dx, dy) {
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

function axisInfo(view) {
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
    if (e.type === "Joint") pts.push({ x: e.x, y: e.y, z: e.z, kind: "Joint" });
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

function ensureJointAt(x, y, z) {
  const tol = 1e-6;
  if (
    elements.some(
      (e) =>
        e.type === "Joint" &&
        Math.abs(e.x - x) < tol &&
        Math.abs(e.y - y) < tol &&
        Math.abs(e.z - z) < tol,
    )
  )
    return;
  elements.push({ id: Date.now() + Math.random(), type: "Joint", x, y, z });
}

function applySnapping(el) {
  const pts = getSnapPoints(el.id);
  const lines = getSnapLines(el.id);

  function snapObj(obj, createJoint) {
    const sc = screenCoords(obj);
    let best = null;
    let bestKind = null;
    let bestDist = SNAP_PIXELS;
    pts.forEach((pt) => {
      const d = distanceScreen(sc, screenCoords(pt));
      if (d < bestDist) {
        best = pt;
        bestDist = d;
        bestKind = pt.kind;
      }
    });
    lines.forEach((line) => {
      const near = nearestPointOnLine(obj, line.p1, line.p2);
      const d = distanceScreen(sc, screenCoords(near));
      if (d < bestDist) {
        best = near;
        bestDist = d;
        bestKind = "Line";
      }
    });
    if (best) {
      obj.x = best.x;
      obj.y = best.y;
      obj.z = best.z;
      if (createJoint && bestKind === "End")
        ensureJointAt(best.x, best.y, best.z);
    }
  }

  if (el.type === "Joint" || el.type === "Support") {
    snapObj(el, false);
  } else if (el.type === "Load") {
    const base = { x: el.x, y: el.y, z: el.z };
    const tip = { x: el.x2 ?? el.x, y: el.y2 ?? el.y, z: el.z2 ?? el.z };
    snapObj(base, false);
    snapObj(tip, false);
    el.x = base.x;
    el.y = base.y;
    el.z = base.z;
    el.x2 = tip.x;
    el.y2 = tip.y;
    el.z2 = tip.z;
    el.amount = Math.hypot(el.x2 - el.x, el.y2 - el.y, el.z2 - el.z);
  } else if (el.type === "Member" || el.type === "Cable") {
    const p1 = { x: el.x, y: el.y, z: el.z };
    const p2 = { x: el.x2 ?? el.x, y: el.y2 ?? el.y, z: el.z2 ?? el.z };
    snapObj(p1, true);
    snapObj(p2, true);
    el.x = p1.x;
    el.y = p1.y;
    el.z = p1.z;
    el.x2 = p2.x;
    el.y2 = p2.y;
    el.z2 = p2.z;
  } else {
    snapObj(el, false);
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

function render(updateProps = true) {
  const svg = document.getElementById("canvas");
  svg.innerHTML = "";
  const rect = svg.getBoundingClientRect();
  const cx = rect.width / 2 + panX;
  const cy = rect.height / 2 + panY;
  document.getElementById("current-view").textContent = currentView;

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
      if (el.type === "Joint") {
        shape = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        shape.setAttribute("cx", sx);
        shape.setAttribute("cy", sy);
        shape.setAttribute("r", 4);
        shape.setAttribute("fill", "blue");
      } else if (el.type === "Plane") {
        if (el.normal && el.normal !== currentView[1]) return;
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
      } else {
        shape = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        shape.setAttribute("cx", sx);
        shape.setAttribute("cy", sy);
        shape.setAttribute("r", 4);
        shape.setAttribute("fill", "blue");
      }
    }
    if (shape) g.appendChild(shape);
    if (el.id === selectedId) g.setAttribute("stroke", "orange");
    svg.appendChild(g);
  });

  if (updateProps) {
    renderProperties();
  }
}

function addElement(type) {
  const id = Date.now();
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
    base.normal = currentView[1];
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
    el.amount = Math.hypot(
      (el.x2 ?? el.x) - el.x,
      (el.y2 ?? el.y) - el.y,
      (el.z2 ?? el.z) - el.z,
    );
    el.amount = Math.hypot(
      (el.x2 ?? el.x) - el.x,
      (el.y2 ?? el.y) - el.y,
      (el.z2 ?? el.z) - el.z,
    );
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
        obj.amount = Math.hypot(obj.x2 - obj.x, obj.y2 - obj.y, obj.z2 - obj.z);
      } else if (obj.type === "Support") {
        obj.ux = e.ux !== false;
        obj.uy = e.uy !== false;
        obj.rz = e.rz !== false;
      }
      return obj;
    });
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
document.getElementById("canvas").addEventListener("wheel", (ev) => {
  ev.preventDefault();
  zoom *= ev.deltaY < 0 ? 1.1 : 0.9;
  render();
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
  const joints = [];
  const map = new Map();
  const key = (x, y) => `${x.toFixed(6)},${y.toFixed(6)}`;
  function idx(x, y) {
    const k = key(x, y);
    if (!map.has(k)) {
      map.set(k, joints.length);
      joints.push({ x, y });
    }
    return map.get(k);
  }

  elements.forEach((el) => {
    if (el.type === "Joint" || el.type === "Support") {
      idx(el.x, el.y);
    } else if (el.type === "Member" || el.type === "Cable") {
      idx(el.x, el.y);
      idx(el.x2 ?? el.x, el.y2 ?? el.y);
    } else if (el.type === "Load") {
      idx(el.x, el.y);
    }
  });

  const members = elements
    .filter((e) => e.type === "Member" || e.type === "Cable")
    .map((e) => ({
      start: idx(e.x, e.y),
      end: idx(e.x2 ?? e.x, e.y2 ?? e.y),
      E: e.E ?? 200e9,
      A: e.A ?? 0.01,
      I: e.I ?? 1e-6,
    }));

  const loads = elements
    .filter((e) => e.type === "Load")
    .map((e) => {
      const i = idx(e.x, e.y);
      const dx = (e.x2 ?? e.x) - e.x;
      const dy = (e.y2 ?? e.y) - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const amt = e.amount ?? 0;
      return { joint: i, fx: (amt * dx) / len, fy: (amt * dy) / len, mz: 0 };
    });

  const supports = elements
    .filter((e) => e.type === "Support")
    .map((e) => ({
      joint: idx(e.x, e.y),
      ux: e.ux !== false,
      uy: e.uy !== false,
      rz: e.rz !== false,
    }));

  return { joints, members, loads, supports };
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
  for (const [k, v] of Object.entries(data.displacements || {})) {
    lines.push(
      `Joint ${k}: ux=${(+v[0]).toExponential(3)} m, uy=${(+v[1]).toExponential(3)} m, rz=${(+v[2]).toExponential(3)} rad`,
    );
  }
  lines.push("Reactions:");
  for (const [k, v] of Object.entries(data.reactions || {})) {
    lines.push(
      `Joint ${k}: fx=${(+v[0]).toExponential(3)} N, fy=${(+v[1]).toExponential(3)} N, mz=${(+v[2]).toExponential(3)} N·m`,
    );
  }
  out.textContent = lines.join("\n");
}

document.getElementById("solve-btn").addEventListener("click", solveModel);

loadState();
