/**
 * NOTE  – All public functions live on the global window object because the
 *         script is executed as a plain <script>.  We simply pull them off.
 */
const {
  getCurrentSheet,
  updateSheetHeader,
  renderSheetList,
  createSheet,
  deleteSheet,
  projectPoint,
  unprojectDelta,
  screenCoords,
  distanceScreen,
  distanceToSegment2D,
  axisInfo,
  planeCorners,
  planeScreenRect,
  solidScreenRect,
  nearestPointOnLine,
  getSnapPoints,
  getSnapLines,
  ensureJointAt,
  applySnapping,
  addNumberInput,
  renderProperties,
  render,
  addElement,
  deleteElement,
  startDrag,
  onDrag,
  endDrag,
  startPan,
  onPan,
  endPan,
  saveState,
  loadState,
  buildModel,
  idx,
  solveModel
} = globalThis;

/* ------------------------------------------------------------------ */
/*  Pure geometry helpers                                             */
/* ------------------------------------------------------------------ */
describe('geometry helpers', () => {
  test.each([
    ['+X', { x: 1, y: 2, z: 3 }, { x: 2, y: -3 }],
    ['-X', { x: 1, y: 2, z: 3 }, { x: -2, y: -3 }],
    ['+Y', { x: 1, y: 2, z: 3 }, { x: 1, y: -3 }],
    ['-Z', { x: 1, y: 2, z: 3 }, { x: -1, y: -2 }]
  ])('projectPoint %s', (view, p, expected) => {
    global.currentView = view;
    expect(projectPoint(p)).toEqual(expected);
  });

  test('unprojectDelta is inverse of projectPoint XY case', () => {
    global.currentView = '+Z';
    const { x, y } = unprojectDelta(5, -7);
    expect(x).toBeCloseTo(5);
    expect(y).toBeCloseTo(7);
  });

  test('distanceScreen', () => {
    expect(distanceScreen({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
  });

  test('distanceToSegment2D – point on segment == 0', () => {
    const p = { x: 2, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    expect(distanceToSegment2D(p, a, b)).toBeCloseTo(0);
  });

  test('nearestPointOnLine clamps outside segment', () => {
    const p = { x: 10, y: 0, z: 0 };
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 1, y: 0, z: 0 };
    expect(nearestPointOnLine(p, a, b)).toEqual(b);
  });

  test('axisInfo returns correct mapping', () => {
    expect(axisInfo('+Y')).toEqual({
      h: { axis: 'x', sign: 1 },
      v: { axis: 'z', sign: -1 }
    });
  });

  test('planeCorners (Z-plane)', () => {
    const corners = planeCorners({ x: 0, y: 0, z: 0, length: 20, width: 10 });
    expect(corners).toHaveLength(4);
    expect(corners[0]).toEqual({ x: -10, y: -5, z: 0 });
  });

  test('planeScreenRect uses screenCoords', () => {
    // Stub screenCoords to identity projection
    const original = global.screenCoords;
    global.screenCoords = (p) => ({ x: p.x, y: p.y });
    const rect = planeScreenRect({ x: 0, y: 0, z: 0, length: 20, width: 20 });
    expect(rect).toEqual({ left: -10, right: 10, top: -10, bottom: 10 });
    global.screenCoords = original;
  });

  test('solidScreenRect dimensions respect currentView', () => {
    // identity screenCoords again
    const original = global.screenCoords;
    global.screenCoords = () => ({ x: 0, y: 0 });
    global.currentView = '+X';
    global.zoom = 1;
    const rect = solidScreenRect({ x: 0, y: 0, z: 0, width: 20, height: 30, depth: 40 });
    expect(rect.left).toBeCloseTo(-15);  // width/2
    expect(rect.top).toBeCloseTo(-20);   // depth/2 in this view
    global.screenCoords = original;
  });
});

/* ------------------------------------------------------------------ */
/*  Sheet list / header                                               */
/* ------------------------------------------------------------------ */
describe('sheet helpers', () => {
  beforeEach(() => {
    global.sheets  = [
      { id: 1, name: 'S1' },
      { id: 2, name: 'S2' }
    ];
    global.sheetId = 1;
  });

  test('getCurrentSheet returns active sheet', () => {
    expect(getCurrentSheet().name).toBe('S1');
  });

  test('updateSheetHeader writes to DOM', () => {
    updateSheetHeader();
    expect(document.getElementById('sheet-title').textContent).toBe('S1');
  });

  test('renderSheetList produces two list items + active class', () => {
    renderSheetList();
    const items = document.querySelectorAll('#sheet-list li');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('active')).toBe(true);
  });

  test('createSheet() hits /sheet and mutates global state', async () => {
    fetch.mockResponseOnce(JSON.stringify({ id: 3, name: 'Untitled' }));
    const prevLen = sheets.length;
    const spyLoad = jest.spyOn(global, 'loadState').mockResolvedValue();
    await createSheet();
    expect(fetch).toHaveBeenCalledWith('/sheet', expect.any(Object));
    expect(sheets).toHaveLength(prevLen + 1);
    expect(sheetId).toBe(3);
    spyLoad.mockRestore();
  });

  test('deleteSheet removes sheet and selects first remaining', async () => {
    fetch.mockResponseOnce('', { status: 200 });
    await deleteSheet(2);
    expect(sheets.map((s) => s.id)).toEqual([1]);
    expect(sheetId).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Snapping & element helpers                                        */
/* ------------------------------------------------------------------ */
describe('snapping helpers', () => {
  beforeEach(() => {
    global.elements = [
      { id: 99, type: 'Joint', x: 0, y: 0, z: 0 }
    ];
  });

  test('ensureJointAt only inserts unique joints', () => {
    const start = elements.length;
    ensureJointAt(0, 0, 0);
    ensureJointAt(1, 0, 0);
    expect(elements.length).toBe(start + 1); // only the second call added
  });

  test('getSnapPoints returns points minus ignored id', () => {
    const pts = getSnapPoints(99);
    expect(pts).toHaveLength(0);
  });

  test('applySnapping moves member start-point onto existing joint', () => {
    const member = {
      id: 123,
      type: 'Member',
      x: 0.2,
      y: 0,
      z: 0,
      x2: 5,
      y2: 0,
      z2: 0
    };
    elements.push(member);
    // identity screenCoords so 0.2 is within SNAP_PIXELS
    const original = global.screenCoords;
    global.screenCoords = (p) => ({ x: p.x * 10, y: p.y * 10 });
    applySnapping(member);
    expect(member.x).toBeCloseTo(0);
    global.screenCoords = original;
  });
});

/* ------------------------------------------------------------------ */
/*  DOM helpers                                                        */
/* ------------------------------------------------------------------ */
describe('DOM widgets', () => {
  test('addNumberInput inserts an input that updates element', () => {
    const container = document.createElement('div');
    const el = { foo: 1 };
    addNumberInput(container, 'Foo', 'foo', el);
    const inp = container.querySelector('input');
    inp.value = '42';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.foo).toBe(42);
  });

  test('renderProperties runs without throwing when nothing selected', () => {
    global.selectedId = null;
    expect(() => renderProperties()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Model builder                                                      */
/* ------------------------------------------------------------------ */
describe('buildModel / idx', () => {
  beforeEach(() => {
    global.elements = [
      { id: 1, type: 'Joint', x: 0, y: 0, z: 0 },
      { id: 2, type: 'Joint', x: 1, y: 0, z: 0 },
      { id: 3, type: 'Member', x: 0, y: 0, z: 0, x2: 1, y2: 0, z2: 0 }
    ];
  });

  test('idx returns consistent indices', () => {
    expect(idx(0, 0)).toBe(idx(0, 0));        // identical call -> same
    expect(idx(0, 0)).not.toBe(idx(1, 0));    // different coord -> diff idx
  });

  test('buildModel gathers joints/members', () => {
    const model = buildModel();
    expect(model.joints).toHaveLength(2);
    expect(model.members).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  saveState / loadState / solveModel (fetch driven)                  */
/* ------------------------------------------------------------------ */
describe('server round-trips', () => {
  test('saveState POSTs /sheet/action', async () => {
    fetch.mockResponseOnce('{}');
    await saveState();
    expect(fetch).toHaveBeenCalledWith(
      '/sheet/action',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('loadState populates elements', async () => {
    const payload = { id: 1, name: 'S1', elements: [{ id: 1, type: 'Joint', x: 0, y: 0, z: 0 }] };
    fetch.mockResponseOnce(JSON.stringify(payload));
    await loadState();
    expect(elements).toHaveLength(1);
  });

  test('solveModel writes output', async () => {
    const fakeResp = {
      displacements: { 0: [0, 0, 0] },
      reactions:     { 0: [0, 0, 0] }
    };
    fetch
      .mockResponseOnce(JSON.stringify(fakeResp));    // /solve
    await solveModel();
    expect(document.getElementById('solve-output').textContent)
      .toMatch(/Displacements:/);
  });
});
