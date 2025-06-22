/* tests/index.test.js */
/* eslint-disable no-undef */
/* Run with `npm test -- --ci --coverage` */

/**
 * The top‑level `index.js` file is loaded in a VM sandbox by
 * `tests/setupJest.cjs`.  Every *function* declared with the classic
 * `function foo() {}` syntax is copied onto the real `global` object so the
 * test file can use them.  *Module‑private* variables declared with `let` or
 * `const` (e.g. `elements`, `sheets`) are **not** exposed and therefore MUST
 * NOT be accessed directly.  Earlier versions of this test suite broke that
 * rule, causing failures.  This revision interacts only with the public
 * surface — functions and the DOM.
 */

const {
  /* geometry */
  projectPoint,
  unprojectDelta,
  screenCoords,
  distanceScreen,
  distanceToSegment2D,
  axisInfo,
  nearestPointOnLine,
  planeCorners,
  planeScreenRect,
  solidScreenRect,

  /* snapping / model */
  ensureJointAt,
  getSnapPoints,
  getSnapLines,
  buildModel,

  /* view helpers */
  setCurrentView,

  /* sheet helpers */
  getCurrentSheet,
  updateSheetHeader,
  renderSheetList,
  createSheet,
  deleteSheet,
  loadState,

  /* widgets */
  addNumberInput,

  /* element helpers */
  addElement,
  deleteElement,

  /* persistence / solver */
  saveState,
  solveModel,
} = global;

//--------------------------------------------------------------------
//  TEST UTILITIES
//--------------------------------------------------------------------

/**
 * Wipe scene‑specific state between tests without poking at private globals.
 * We do this by *using* the public API rather than mutating hidden internals.
 */
function resetScene() {
  // Reset view and camera state
  setCurrentView("+Z");
  global.panX = 0;
  global.panY = 0;
  global.zoom = 1;

  // Clear relevant DOM elements
  document.getElementById("solve-output").textContent = "";
  document.getElementById("sheet-title").textContent = "";
  document.getElementById("sheet-list").innerHTML = "";
}

beforeEach(async () => {
  // Reset module state by loading empty sheet data
  fetch.resetMocks();
  fetch.mockResponseOnce(
    JSON.stringify({ id: 1, name: "Sheet 1", elements: [] }),
  );
  // loadState will clear `elements` in the sandbox
  await loadState();

  // Stub default fetch for other API calls
  fetch.resetMocks();
  fetch.mockResponse("{}");

  // Reset view and camera
  setCurrentView("+Z");
  global.panX = 0;
  global.panY = 0;
  global.zoom = 1;

  // Clear DOM text areas
  document.getElementById("solve-output").textContent = "";
  document.getElementById("sheet-title").textContent = "";
  document.getElementById("sheet-list").innerHTML = "";
});

//--------------------------------------------------------------------
//  GEOMETRY HELPERS
//--------------------------------------------------------------------

describe("geometry helpers (pure maths)", () => {
  test.each([
    ["+X", { x: 1, y: 2, z: 3 }, { x: 2, y: -3 }],
    ["-X", { x: 1, y: 2, z: 3 }, { x: -2, y: -3 }],
    ["+Y", { x: 1, y: 2, z: 3 }, { x: 1, y: -3 }],
    ["-Z", { x: 1, y: 2, z: 3 }, { x: -1, y: -2 }],
  ])("projectPoint for %s view", (view, p, expected) => {
    setCurrentView(view);
    expect(projectPoint(p)).toEqual(expected);
  });

  test("unprojectDelta mirrors projectPoint along +Z view", () => {
    setCurrentView("+Z");
    const res = unprojectDelta(5, 0); // dx ⇒ +x , dy ⇒ -y
    expect(res.x).toBeCloseTo(5);
    // JS distinguishes 0 and -0 when using Object.is, but for geometry any
    // sign‑zero is acceptable.  Use |value| < ε instead of strict equality.
    expect(Math.abs(res.y)).toBeLessThan(1e-12);
  });

  test("screenCoords maps origin to canvas centre", () => {
    // Canvas size is stubbed to 800×600 in setupJest.
    setCurrentView("+Z");
    const sc = screenCoords({ x: 0, y: 0, z: 0 });
    expect(sc).toMatchObject({ x: 400, y: 300 });
  });

  test("distance helpers produce Euclidean metrics", () => {
    expect(distanceScreen({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    const p = { x: 2, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    expect(distanceToSegment2D(p, a, b)).toBe(0);
  });

  test("axisInfo returns correct axes/signs for +Y", () => {
    expect(axisInfo("+Y")).toEqual({
      h: { axis: "x", sign: 1 },
      v: { axis: "z", sign: -1 },
    });
  });

  test("nearestPointOnLine clamps to segment end when outside", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 1, y: 0, z: 0 };
    const p = { x: 10, y: 0, z: 0 };
    expect(nearestPointOnLine(p, a, b)).toEqual(b);
  });
});

//--------------------------------------------------------------------
//  PLANE / SOLID HELPERS
//--------------------------------------------------------------------

describe("plane / solid helpers", () => {
  test("planeCorners returns four corner points for Z‑normal", () => {
    const el = { x: 0, y: 0, z: 0, length: 40, width: 20, normal: "Z" };
    const corners = planeCorners(el);
    expect(corners).toHaveLength(4);
    expect(corners).toContainEqual({ x: -20, y: -10, z: 0 });
    expect(corners).toContainEqual({ x: 20, y: 10, z: 0 });
  });

  test("planeScreenRect projects correct pixel size in +Z view", () => {
    setCurrentView("+Z");
    const el = { x: 0, y: 0, z: 0, length: 40, width: 20, normal: "Z" };
    const rect = planeScreenRect(el);
    expect(rect.right - rect.left).toBeCloseTo(40 * global.zoom);
    expect(rect.bottom - rect.top).toBeCloseTo(20 * global.zoom);
  });

  test("solidScreenRect projects correct face dims in +Z view", () => {
    setCurrentView("+Z");
    const el = { x: 0, y: 0, z: 0, width: 20, height: 30, depth: 40 };
    const rect = solidScreenRect(el);
    expect(rect.right - rect.left).toBeCloseTo(20 * global.zoom); // width along X
    expect(rect.bottom - rect.top).toBeCloseTo(30 * global.zoom); // height along Y
  });
});

//--------------------------------------------------------------------
//  SNAPPING UTILITIES
//--------------------------------------------------------------------

describe("snapping utilities", () => {
  test("getSnapPoints collects points from various element types", () => {
    addElement("Load");
    addElement("Member");

    const pts = getSnapPoints();
    expect(pts.some((p) => p.kind === "Load")).toBe(true);
    expect(pts.some((p) => p.kind === "End")).toBe(true); // member ends
  });

  test("getSnapLines returns member / load centre‑lines", () => {
    addElement("Member");
    const lines = getSnapLines();
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toHaveProperty("p1");
    expect(lines[0]).toHaveProperty("p2");
  });
});

//--------------------------------------------------------------------
//  MODEL BUILDING
//--------------------------------------------------------------------

describe("buildModel", () => {
  test("returns non‑empty arrays after adding typical elements", () => {
    addElement("Support");
    addElement("Member");
    addElement("Load");

    const model = buildModel();
    expect(model.members.length).toBeGreaterThan(0);
    expect(model.loads.length).toBeGreaterThan(0);
    expect(model.supports.length).toBeGreaterThan(0);
  });
});

//--------------------------------------------------------------------
//  ELEMENT CREATION
//--------------------------------------------------------------------

describe("addElement API", () => {
  test('addElement("Member") adds a member with two endpoints', () => {
    const before = buildModel().members.length;
    addElement("Member");
    const after = buildModel().members.length;
    expect(after).toBe(before + 1);
  });

  test('addElement("Support") adds a support point', () => {
    const before = buildModel().supports.length;
    addElement("Support");
    const after = buildModel().supports.length;
    expect(after).toBe(before + 1);
  });
});

//--------------------------------------------------------------------
//  SHEET / DOM HELPERS
//--------------------------------------------------------------------

describe("sheet helpers (DOM)", () => {
  test("getCurrentSheet reads initial sheet correctly", () => {
    expect(getCurrentSheet()).toEqual({ id: 1, name: "Sheet 1" });
  });

  test("updateSheetHeader writes the sheet name into #sheet-title", () => {
    updateSheetHeader();
    expect(document.getElementById("sheet-title").textContent).toBe("Sheet 1");
  });

  test("renderSheetList outputs one <li> for the initial sheet", () => {
    renderSheetList();
    const items = document.querySelectorAll("#sheet-list li.sheet-item");
    expect(items.length).toBe(1);
  });
});

//--------------------------------------------------------------------
//  SERVER INTERACTIONS
//--------------------------------------------------------------------

describe("server round‑trips", () => {
  test("saveState() POSTs to /sheet/action", async () => {
    fetch.mockResponseOnce("{}");
    await saveState();
    expect(fetch).toHaveBeenCalledWith(
      "/sheet/action",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("solveModel() prints 'DISPLACEMENTS:' block on success", async () => {
    fetch.mockResponseOnce(
      JSON.stringify({ displacements: { "1": [0, 0, 0] }, reactions: {} }),
    );
    await solveModel();
    expect(document.getElementById("solve-output").textContent).toMatch(
      /DISPLACEMENTS:/,
    );
  });

  test("createSheet() adds a new sheet and updates DOM", async () => {
    fetch.mockResponses(
      // createSheet() → POST /sheet
      [JSON.stringify({ id: 2, name: "New Sheet" }), { status: 200 }],
      // loadState() → GET /sheet/2
      [
        JSON.stringify({ id: 2, name: "New Sheet", elements: [] }),
        { status: 200 },
      ],
    );

    await createSheet();

    // Two <li> items in the sheet list now.
    expect(document.querySelectorAll("#sheet-list li.sheet-item").length).toBe(
      2,
    );
    expect(getCurrentSheet().id).toBe(2);
  });

  test("deleteSheet() removes a sheet and falls back to first", async () => {
    // First create a second sheet so we have something to delete.
    fetch.mockResponses(
      [JSON.stringify({ id: 2, name: "Temp" }), { status: 200 }], // createSheet
      [JSON.stringify({ id: 2, name: "Temp", elements: [] }), { status: 200 }], // loadState (after create)
    );
    await createSheet();

    // Stub out the DELETE and subsequent loadState()
    fetch.mockResponses(
      ["", { status: 200 }], // deleteSheet
      [
        JSON.stringify({ id: 1, name: "Sheet 1", elements: [] }),
        { status: 200 },
      ], // loadState (after delete)
    );

    await deleteSheet(2);

    expect(document.querySelectorAll("#sheet-list li.sheet-item").length).toBe(
      1,
    );
    expect(getCurrentSheet().id).toBe(1);
  });

  test("loadState() preserves load amount from server", async () => {
    fetch.mockResponseOnce(
      JSON.stringify({
        id: 1,
        name: "Sheet 1",
        elements: [
          { id: 10, type: "Load", x: 0, y: 0, z: 0, x2: 0, y2: 10, z2: 0, amount: 99 },
        ],
      }),
    );

    await loadState();
    const model = buildModel();
    expect(model.loads[0].fy).toBeCloseTo(99);
  });
});

//--------------------------------------------------------------------
//  WIDGETS
//--------------------------------------------------------------------

describe("addNumberInput widget", () => {
  test("creates an <input> that mutates the supplied object", () => {
    const container = document.createElement("div");
    const obj = { foo: 0 };

    addNumberInput(container, "Foo", "foo", obj);

    const input = container.querySelector("input");
    input.value = "123";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(obj.foo).toBe(123);
  });
});

//--------------------------------------------------------------------
//  ZOOM / KEYBOARD CONTROLS
//--------------------------------------------------------------------

describe("zoom and keyboard controls", () => {
  test("zoomIn increases projected distance", () => {
    resetPanZoom();
    const before = screenCoords({ x: 0, y: 10, z: 0 }).x;
    zoomIn();
    const after = screenCoords({ x: 0, y: 10, z: 0 }).x;
    expect(after - 400).toBeCloseTo((before - 400) * 1.25);
  });

  test("zoomOut decreases projected distance", () => {
    resetPanZoom();
    const before = screenCoords({ x: 0, y: 10, z: 0 }).x;
    zoomOut();
    const after = screenCoords({ x: 0, y: 10, z: 0 }).x;
    expect(after - 400).toBeCloseTo((before - 400) * 0.8);
  });

  test("resetPanZoom restores default zoom", () => {
    zoomIn();
    resetPanZoom();
    const sc = screenCoords({ x: 0, y: 10, z: 0 }).x;
    expect(sc).toBeCloseTo(400);
  });

  test("pressing Delete triggers deleteElement", () => {
    addElement("Member");
    const g = document.querySelector("#canvas g");
    g.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }),
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
    expect(buildModel().members.length).toBe(0);
  });

  test("holding Shift and scrolling zooms", () => {
    resetPanZoom();
    const canvas = document.getElementById("canvas");
    const before = screenCoords({ x: 10, y: 0, z: 0 }).x;
    canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -100, shiftKey: true, bubbles: true }),
    );
    const mid = screenCoords({ x: 10, y: 0, z: 0 }).x;
    expect(mid).toBeGreaterThanOrEqual(before);
    canvas.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 100, shiftKey: true, bubbles: true }),
    );
    const after = screenCoords({ x: 10, y: 0, z: 0 }).x;
    expect(after).toBeLessThan(mid);
  });

  test("rotation functions work correctly", () => {
    // Test rotation matrix creation
    const matrix = getRotationMatrix();
    expect(matrix).toHaveLength(3);
    expect(matrix[0]).toHaveLength(3);
    expect(matrix[1]).toHaveLength(3);
    expect(matrix[2]).toHaveLength(3);
    
    // Test point rotation
    const point = { x: 1, y: 0, z: 0 };
    const rotated = rotatePoint(point, matrix);
    expect(rotated).toHaveProperty('x');
    expect(rotated).toHaveProperty('y');
    expect(rotated).toHaveProperty('z');
  });

  test("continuous rotation mode works", () => {
    // Switch to continuous mode
    setCurrentView("continuous");
    
    // Test projection in continuous mode
    const point = { x: 1, y: 0, z: 0 };
    const projected = projectPoint(point);
    expect(projected).toHaveProperty('x');
    expect(projected).toHaveProperty('y');
    
    // Switch back to discrete mode
    setCurrentView("+Z");
    expect(currentView).toBe("+Z");
  });
});
