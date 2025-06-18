// tests/index.test.js  – Common-JS because Jest runs in CJS by default
/* eslint-disable no-undef */

//
// grab the top-level functions that the loader in setupJest.cjs
// copied from the VM sandbox onto real globalThis
//
const {
  /* geometry */
  projectPoint,
  unprojectDelta,
  distanceScreen,
  distanceToSegment2D,
  axisInfo,
  planeCorners,
  planeScreenRect,
  solidScreenRect,
  nearestPointOnLine,

  /* app helpers */
  getCurrentSheet,
  updateSheetHeader,
  renderSheetList,
  createSheet,
  deleteSheet,

  /* snapping */
  ensureJointAt,
  getSnapPoints,
  applySnapping,

  /* DOM widgets */
  addNumberInput,
  renderProperties,

  /* model */
  buildModel,

  /* persistence / server */
  saveState,
  loadState,
  solveModel
} = global;

/* ------------------------------------------------------------------ */
/*  GEOMETRY HELPERS                                                  */
/* ------------------------------------------------------------------ */

describe('geometry helpers', () => {
  test('projectPoint default view (+X) works', () => {
    expect(projectPoint({ x: 1, y: 2, z: 3 })).toEqual({ x: 2, y: -3 });
  });

  test('unprojectDelta is algebraic inverse in +X view (dx only)', () => {
    const res = unprojectDelta(5, 0); // currentView is still +X
    expect(res).toEqual({ y: 5, z: 0 }); // +X maps dx -> +y
  });

  test('distance helpers', () => {
    expect(distanceScreen({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    const p  = { x: 2, y: 0 };
    const a  = { x: 0, y: 0 };
    const b  = { x: 4, y: 0 };
    expect(distanceToSegment2D(p, a, b)).toBe(0);
  });

  test('axisInfo reports the correct axes/sign for +Y', () => {
    expect(axisInfo('+Y')).toEqual({
      h: { axis: 'x', sign: 1 },
      v: { axis: 'z', sign: -1 }
    });
  });

  test('planeScreenRect + identity screenCoords gives bounding box', () => {
    // temporarily stub screenCoords to identity
    const originalSC = global.screenCoords;
    global.screenCoords = p => ({ x: p.x, y: p.y });

    const rect = planeScreenRect({ x: 0, y: 0, z: 0, length: 20, width: 20 });
    expect(rect).toEqual({ left: -10, right: 10, top: -10, bottom: 10 });

    global.screenCoords = originalSC;
  });

  test('solidScreenRect returns half-width/height extents in +X view', () => {
    const originalSC = global.screenCoords;
    const originalZoom = global.zoom;
    global.screenCoords = () => ({ x: 0, y: 0 });
    global.zoom = 1;

    const rect = solidScreenRect({
      x: 0, y: 0, z: 0,
      width: 20,  // not used in +X
      height: 30, // horizontal dimension in +X
      depth: 40   // vertical   dimension in +X
    });
    expect(rect.left).toBeCloseTo(-15);  // 30 / 2
    expect(rect.top).toBeCloseTo(-20);   // 40 / 2

    global.screenCoords = originalSC;
    global.zoom = originalZoom;
  });

  test('nearestPointOnLine clamps outside the segment', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 1, y: 0, z: 0 };
    const p = { x: 10, y: 0, z: 0 };
    expect(nearestPointOnLine(p, a, b)).toEqual(b);
  });
});

/* ------------------------------------------------------------------ */
/*  SHEET HELPERS                                                     */
/* ------------------------------------------------------------------ */

describe('sheet helpers', () => {
  beforeEach(() => {
    // mutate the original array object – don't replace it:
    global.sheets.length = 0;
    global.sheets.push(
      { id: 1, name: 'Sheet 1' },
      { id: 2, name: 'Sheet 2' }
    );
    global.sheetId = 1;
    renderSheetList(); // keep DOM in sync
  });

  test('getCurrentSheet returns active sheet', () => {
    expect(getCurrentSheet().name).toBe('Sheet 1');
  });

  test('updateSheetHeader writes correct name into the DOM', () => {
    updateSheetHeader();
    expect(document.getElementById('sheet-title').textContent).toBe('Sheet 1');
  });

  test('renderSheetList creates a <li> per sheet & tags active', () => {
    const items = document.querySelectorAll('#sheet-list li');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('active')).toBe(true);
  });

  test('createSheet appends to the same sheets array', async () => {
    const prevLen = global.sheets.length;
    jest.spyOn(global, 'loadState').mockResolvedValue();
    fetch.mockResponseOnce(JSON.stringify({ id: 3, name: 'Untitled' }));
    await createSheet();
    expect(global.sheets).toHaveLength(prevLen + 1);
    expect(global.sheetId).toBe(3);
    global.loadState.mockRestore();
  });

  test('deleteSheet removes and re-selects sheets correctly', async () => {
    fetch.mockResponseOnce('', { status: 200 });
    await deleteSheet(2);
    expect(global.sheets.map(s => s.id)).toEqual([1]);
    expect(global.sheetId).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  SNAPPING                                                          */
/* ------------------------------------------------------------------ */

describe('snapping helpers', () => {
  beforeEach(() => {
    global.elements.length = 0; // reset
    global.elements.push({ id: 99, type: 'Joint', x: 0, y: 0, z: 0 });
  });

  test('ensureJointAt avoids duplicates within tolerance', () => {
    const start = global.elements.length;
    ensureJointAt(0, 0, 0);   // duplicate → ignored
    ensureJointAt(1, 0, 0);   // new       → added
    expect(global.elements.length).toBe(start + 1);
  });

  test('getSnapPoints respects ignoreId', () => {
    // add a second joint that isn't ignored
    global.elements.push({ id: 100, type: 'Joint', x: 1, y: 0, z: 0 });
    const pts = getSnapPoints(99);
    expect(pts.every(pt => pt.x === 1)).toBe(true); // only the joint @ x=1 left
  });

  /* still valuable: check that applySnapping projects close points onto joints */
  test('applySnapping moves member start to existing joint', () => {
    // stub screenCoords → map 0.2 distance into < SNAP_PIXELS
    const originalSC = global.screenCoords;
    global.screenCoords = p => ({ x: p.x * 10, y: p.y * 10 });

    const member = {
      id: 123, type: 'Member',
      x: 0.2, y: 0, z: 0,
      x2: 5,  y2: 0, z2: 0
    };
    global.elements.push(member);

    applySnapping(member);
    expect(member.x).toBeCloseTo(0);

    global.screenCoords = originalSC;
  });
});

/* ------------------------------------------------------------------ */
/*  DOM WIDGETS                                                       */
/* ------------------------------------------------------------------ */

describe('DOM widgets', () => {
  test('addNumberInput injects <input> that mutates the element', () => {
    const container = document.createElement('div');
    const el = { foo: 1 };
    addNumberInput(container, 'Foo', 'foo', el);

    const input = container.querySelector('input');
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.foo).toBe(42);
  });

  test('renderProperties runs when nothing is selected', () => {
    global.selectedId = null;
    expect(() => renderProperties()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  MODEL BUILDING                                                    */
/* ------------------------------------------------------------------ */

describe('buildModel', () => {
  beforeEach(() => {
    global.elements.length = 0;
    // create two joints and a member between them
    global.elements.push(
      { id: 1, type: 'Joint',  x: 0, y: 0, z: 0 },
      { id: 2, type: 'Joint',  x: 1, y: 0, z: 0 },
      { id: 3, type: 'Member', x: 0, y: 0, z: 0, x2: 1, y2: 0, z2: 0 }
    );
  });

  test('buildModel captures all joints & members', () => {
    const model = buildModel();
    expect(model.joints).toHaveLength(2);
    expect(model.members).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  SERVER ROUND-TRIPS                                                */
/* ------------------------------------------------------------------ */

describe('server round-trips', () => {
  test('saveState POSTs to /sheet/action', async () => {
    fetch.mockResponseOnce('{}');
    await saveState();
    expect(fetch).toHaveBeenCalledWith(
      '/sheet/action',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('loadState replaces global.elements with payload', async () => {
    global.elements.length = 0; // ensure clean slate
    const payload = {
      id: 1, name: 'Sheet 1',
      elements: [{ id: 7, type: 'Joint', x: 0, y: 0, z: 0 }]
    };
    fetch.mockResponseOnce(JSON.stringify(payload));
    await loadState();
    expect(global.elements).toHaveLength(1);
    expect(global.elements[0].id).toBe(7);
  });

  test('solveModel prints a displacement section', async () => {
    fetch.mockResponseOnce(JSON.stringify({
      displacements: { 0: [0, 0, 0] },
      reactions:     { 0: [0, 0, 0] }
    }));
    await solveModel();
    expect(document.getElementById('solve-output').textContent)
      .toMatch(/Displacements:/);
  });
});
