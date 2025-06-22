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

  /* persistence / solver */
  saveState,
  solveModel,

  /* property rendering */
  renderProperties,

  /* unit conversion */
  convertValue,

  /* geometry utilities */
  constrainToOrthogonal,
  isPointInPolygon,

  /* pan controls */
  onPan,
  endPan,

  /* rotation controls */
  onRotation,
  endRotation,
} = global;

//--------------------------------------------------------------------
//  TEST UTILITIES
//--------------------------------------------------------------------

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
    ["+X", { x: 1, y: 2, z: 3 }, { x: -3, y: -2 }], // rotationY = -π/2, rotationZ = 0
    ["-X", { x: 1, y: 2, z: 3 }, { x: 3, y: -2 }], // rotationY = π/2, rotationZ = 0
    ["+Y", { x: 1, y: 2, z: 3 }, { x: -2, y: -1 }], // rotationY = 0, rotationZ = π/2
    ["-Z", { x: 1, y: 2, z: 3 }, { x: -1, y: -2 }], // rotationY = π, rotationZ = 0
  ])("projectPoint for %s view", (view, p, expected) => {
    setCurrentView(view);
    const result = projectPoint(p);
    if (view === "-Z" || view === "+Y") {
      expect(result.x).toBeCloseTo(expected.x);
      expect(result.y).toBeCloseTo(expected.y);
    } else {
      expect(result).toEqual(expected);
    }
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
      v: { axis: "y", sign: -1 },
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
      JSON.stringify({ displacements: { 1: [0, 0, 0] }, reactions: {} }),
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
      [JSON.stringify({ status: "deleted" }), { status: 200 }], // deleteSheet
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
          {
            id: 10,
            type: "Load",
            x: 0,
            y: 0,
            z: 0,
            x2: 0,
            y2: 10,
            z2: 0,
            amount: 99,
          },
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
    expect(rotated).toHaveProperty("x");
    expect(rotated).toHaveProperty("y");
    expect(rotated).toHaveProperty("z");
  });

  test("continuous rotation mode works", () => {
    // Switch to continuous mode
    setCurrentView("continuous");

    // Test projection in continuous mode
    const point = { x: 1, y: 0, z: 0 };
    const projected = projectPoint(point);
    expect(projected).toHaveProperty("x");
    expect(projected).toHaveProperty("y");

    // Switch back to discrete mode
    setCurrentView("+Z");
    expect(currentView).toBe("+Z");
  });
});

//--------------------------------------------------------------------
//  PROPERTY RENDERING
//--------------------------------------------------------------------

describe("renderProperties", () => {
  test("renders properties for selected member", async () => {
    addElement("Member");
    const g = document.querySelector("#canvas g");
    g.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await renderProperties();

    const propsContent = document.getElementById("props-content");
    expect(propsContent.innerHTML).toContain("Member");
    expect(propsContent.innerHTML).toContain("Point 1");
    expect(propsContent.innerHTML).toContain("Point 2");
  });

  test("renders properties for selected support", async () => {
    addElement("Support");
    const g = document.querySelector("#canvas g");
    g.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await renderProperties();

    const propsContent = document.getElementById("props-content");
    expect(propsContent.innerHTML).toContain("Support");
    expect(propsContent.innerHTML).toContain("ux");
    expect(propsContent.innerHTML).toContain("uy");
    expect(propsContent.innerHTML).toContain("rz");
  });

  test("renders properties for selected load", async () => {
    addElement("Load");
    const g = document.querySelector("#canvas g");
    g.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await renderProperties();

    const propsContent = document.getElementById("props-content");
    expect(propsContent.innerHTML).toContain("Load");
    expect(propsContent.innerHTML).toContain("amount");
  });

  test("renders global properties section", async () => {
    await renderProperties();

    const propsContent = document.getElementById("props-content");
    expect(propsContent.innerHTML).toContain("Global");
    expect(propsContent.innerHTML).toContain("Units");
    expect(propsContent.innerHTML).toContain("Gravity");
  });

  test("disables delete button when no element selected", async () => {
    // Clear any selected element
    document
      .getElementById("canvas")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await renderProperties();

    const deleteBtn = document.getElementById("delete-btn");
    expect(deleteBtn.disabled).toBe(true);
  });

  test("enables delete button when element selected", async () => {
    addElement("Member");
    const g = document.querySelector("#canvas g");
    g.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await renderProperties();

    const deleteBtn = document.getElementById("delete-btn");
    expect(deleteBtn.disabled).toBe(false);
  });
});

//--------------------------------------------------------------------
//  UNIT CONVERSION
//--------------------------------------------------------------------

describe("convertValue", () => {
  beforeEach(() => {
    // Mock fetch for unit conversion API calls
    fetch.mockResponse(
      JSON.stringify({
        conversions: [
          {
            display_value: 1000,
            symbol: "mm",
            si_value: 1.0,
          },
        ],
      }),
    );
  });

  test("converts length to display units", async () => {
    const result = await convertValue(1.0, "length", "to_display");
    expect(result.value).toBe(1000);
    expect(result.symbol).toBe("mm");
  });

  test("converts length from display units", async () => {
    const result = await convertValue(1000, "length", "from_display");
    expect(result).toBe(1.0);
  });

  test("converts force to display units", async () => {
    fetch.mockResponse(
      JSON.stringify({
        conversions: [
          {
            display_value: 1.0,
            symbol: "kN",
            si_value: 1000,
          },
        ],
      }),
    );

    const result = await convertValue(1000, "force", "to_display");
    expect(result.value).toBe(1.0);
    expect(result.symbol).toBe("kN");
  });

  test("falls back to direct calculation when API fails", async () => {
    // Mock console.error to suppress the expected error output
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    fetch.mockReject(new Error("Network error"));

    const result = await convertValue(1.0, "length", "to_display");
    expect(result.value).toBe(1000);
    expect(result.symbol).toBe("mm");
    
    // Restore console.error
    consoleSpy.mockRestore();
  });

  test("handles metric units correctly", async () => {
    // Set global props for metric
    global.globalProps = { units: "metric" };

    const result = await convertValue(1.0, "length", "to_display");
    expect(result.value).toBe(1000);
    expect(result.symbol).toBe("mm");
  });

  test("handles imperial units correctly", async () => {
    // Set global props for imperial
    global.globalProps = { units: "imperial" };

    // Mock the API response for imperial
    fetch.mockResponse(
      JSON.stringify({
        conversions: [
          {
            display_value: 12.0,
            symbol: "in",
            si_value: 0.3048,
          },
        ],
      }),
    );

    const result = await convertValue(0.3048, "length", "to_display");
    expect(result.value).toBe(12.0);
    expect(result.symbol).toBe("in");
  });
});

//--------------------------------------------------------------------
//  GEOMETRY UTILITIES
//--------------------------------------------------------------------

describe("constrainToOrthogonal", () => {
  test("constrains plane edge movements to orthogonal axes", () => {
    const delta = { x: 5, y: 3, z: 2 };

    // Edge 0-1 (Y-Z plane)
    const result1 = constrainToOrthogonal(delta, 0, "Plane");
    expect(result1.x).toBe(0);
    expect(result1.y).toBe(3);
    expect(result1.z).toBe(2);

    // Edge 1-2 (X-Z plane)
    const result2 = constrainToOrthogonal(delta, 1, "Plane");
    expect(result2.x).toBe(5);
    expect(result2.y).toBe(0);
    expect(result2.z).toBe(2);
  });

  test("constrains solid face movements to normal axis", () => {
    const delta = { x: 5, y: 3, z: 2 };

    // Bottom face (Z normal)
    const result1 = constrainToOrthogonal(delta, 0, "Solid");
    expect(result1.x).toBe(0);
    expect(result1.y).toBe(0);
    expect(result1.z).toBe(2);

    // Front face (Y normal)
    const result2 = constrainToOrthogonal(delta, 2, "Solid");
    expect(result2.x).toBe(0);
    expect(result2.y).toBe(3);
    expect(result2.z).toBe(0);

    // Left face (X normal)
    const result3 = constrainToOrthogonal(delta, 4, "Solid");
    expect(result3.x).toBe(5);
    expect(result3.y).toBe(0);
    expect(result3.z).toBe(0);
  });

  test("handles out of bounds indices gracefully", () => {
    const delta = { x: 5, y: 3, z: 2 };

    const result1 = constrainToOrthogonal(delta, 10, "Plane");
    expect(result1.x).toBe(0);
    expect(result1.y).toBe(0);
    expect(result1.z).toBe(0);

    const result2 = constrainToOrthogonal(delta, 10, "Solid");
    expect(result2.x).toBe(0);
    expect(result2.y).toBe(0);
    expect(result2.z).toBe(0);
  });
});

describe("isPointInPolygon", () => {
  test("returns true for point inside polygon", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const point = { x: 5, y: 5 };
    expect(isPointInPolygon(point, polygon)).toBe(true);
  });

  test("returns false for point outside polygon", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const point = { x: 15, y: 15 };
    expect(isPointInPolygon(point, polygon)).toBe(false);
  });

  test("returns true for point on polygon edge (implementation specific)", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];

    const point = { x: 5, y: 0 };
    // The actual implementation considers edge points as inside
    expect(isPointInPolygon(point, polygon)).toBe(true);
  });

  test("handles complex polygon shapes", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: -5, y: 5 },
    ];

    const insidePoint = { x: 5, y: 5 };
    const outsidePoint = { x: 20, y: 20 };

    expect(isPointInPolygon(insidePoint, polygon)).toBe(true);
    expect(isPointInPolygon(outsidePoint, polygon)).toBe(false);
  });
});

//--------------------------------------------------------------------
//  PAN CONTROLS
//--------------------------------------------------------------------

describe("pan controls", () => {
  beforeEach(() => {
    resetPanZoom();
  });

  test("onPan updates pan coordinates", async () => {
    const ev = {
      clientX: 100,
      clientY: 200,
    };

    // Set up pan state by directly setting global variables
    global.panStartX = 0;
    global.panStartY = 0;
    global.panOrigX = 0;
    global.panOrigY = 0;

    await onPan(ev);

    // Check that pan coordinates were updated
    expect(global.panX).toBe(100);
    expect(global.panY).toBe(200);
  });

  test("onPan uses original pan coordinates as offset", async () => {
    const ev = {
      clientX: 150,
      clientY: 250,
    };

    // Set up pan state with existing pan
    global.panStartX = 50;
    global.panStartY = 100;
    global.panOrigX = 10;
    global.panOrigY = 20;

    await onPan(ev);

    expect(global.panX).toBe(110); // 10 + (150 - 50)
    expect(global.panY).toBe(170); // 20 + (250 - 100)
  });

  test("endPan removes event listeners and sets isPanning to false", () => {
    const removeEventListenerSpy = jest.spyOn(document, "removeEventListener");

    // Set isPanning to true first
    global.isPanning = true;

    endPan();

    expect(removeEventListenerSpy).toHaveBeenCalledWith("mousemove", onPan);
    expect(removeEventListenerSpy).toHaveBeenCalledWith("mouseup", endPan);
    expect(global.isPanning).toBe(false);

    removeEventListenerSpy.mockRestore();
  });
});

//--------------------------------------------------------------------
//  ROTATION CONTROLS
//--------------------------------------------------------------------

describe("rotation controls", () => {
  beforeEach(() => {
    resetPanZoom();
  });

  test("onRotation updates rotation angles", async () => {
    const ev = {
      clientX: 100,
      clientY: 200,
    };

    // Set up rotation state by directly setting global variables
    global.rotationStartX = 0;
    global.rotationStartY = 0;
    global.rotationOrigX = 0;
    global.rotationOrigY = 0;
    global.rotationOrigZ = 0;
    global.isRotating = true;

    await onRotation(ev);

    expect(global.rotationX).toBeCloseTo(2.0, 1); // 200 * 0.01
    expect(global.rotationY).toBeCloseTo(1.0, 1); // 100 * 0.01
    expect(global.rotationZ).toBeCloseTo(1.5, 1); // (100 + 200) * 0.005
  });

  test("onRotation does nothing when not rotating", async () => {
    const ev = {
      clientX: 100,
      clientY: 200,
    };

    global.isRotating = false;
    const originalRotationX = global.rotationX;
    const originalRotationY = global.rotationY;
    const originalRotationZ = global.rotationZ;

    await onRotation(ev);

    expect(global.rotationX).toBe(originalRotationX);
    expect(global.rotationY).toBe(originalRotationY);
    expect(global.rotationZ).toBe(originalRotationZ);
  });

  test("onRotation uses original rotation as base", async () => {
    const ev = {
      clientX: 50,
      clientY: 100,
    };

    // Set up rotation state with existing rotation
    global.rotationStartX = 0;
    global.rotationStartY = 0;
    global.rotationOrigX = Math.PI / 4; // 45 degrees
    global.rotationOrigY = Math.PI / 6; // 30 degrees
    global.rotationOrigZ = Math.PI / 3; // 60 degrees
    global.isRotating = true;

    await onRotation(ev);

    expect(global.rotationX).toBeCloseTo(Math.PI / 4 + 1.0, 1); // 45° + 100 * 0.01
    expect(global.rotationY).toBeCloseTo(Math.PI / 6 + 0.5, 1); // 30° + 50 * 0.01
    expect(global.rotationZ).toBeCloseTo(Math.PI / 3 + 0.75, 1); // 60° + (50 + 100) * 0.005
  });

  test("endRotation removes event listeners and sets isRotating to false", () => {
    const removeEventListenerSpy = jest.spyOn(document, "removeEventListener");

    // Set isRotating to true first
    global.isRotating = true;

    endRotation();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "mousemove",
      onRotation,
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith("mouseup", endRotation);
    expect(global.isRotating).toBe(false);

    removeEventListenerSpy.mockRestore();
  });
});
