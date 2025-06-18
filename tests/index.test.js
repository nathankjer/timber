/* tests/index.test.js */
/* eslint-disable no-undef */

/**
 * ⚠  All globals (functions, constants) defined with `function foo() {}` in
 *    index.js are copied onto real `global` by the VM loader in
 *    tests/setupJest.cjs.  We import only the ones we actually test.
 */
const {
  /* geometry */
  projectPoint,
  unprojectDelta,
  distanceScreen,
  distanceToSegment2D,
  axisInfo,
  nearestPointOnLine,

  /* sheets / UI */
  getCurrentSheet,
  updateSheetHeader,

  /* widgets */
  addNumberInput,

  /* server helpers */
  saveState,
  solveModel
} = global;

/* --------------------------------------------------------------- */
/*  GEOMETRY                                                       */
/* --------------------------------------------------------------- */

describe('geometry helpers (pure maths)', () => {
  test.each([
    ['+X', { x: 1, y: 2, z: 3 }, { x: 2, y: -3 }],
    ['-X', { x: 1, y: 2, z: 3 }, { x: -2, y: -3 }],
    ['+Y', { x: 1, y: 2, z: 3 }, { x: 1, y: -3 }],
    ['-Z', { x: 1, y: 2, z: 3 }, { x: -1, y: -2 }]
  ])('projectPoint for %s view', (view, p, expected) => {
    global.currentView = view;
    expect(projectPoint(p)).toEqual(expected);
  });

  test('unprojectDelta mirrors projectPoint along +X view', () => {
    global.currentView = '+X';
    const res = unprojectDelta(5, 0); // dx ⇒ +y , dy ⇒ -z
    expect(res.y).toBeCloseTo(5);
    expect(res.z).toBeCloseTo(0);
  });

  test('distance helpers produce Euclidean metrics', () => {
    expect(distanceScreen({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5);
    const p = { x: 2, y: 0 };
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    expect(distanceToSegment2D(p, a, b)).toBe(0);
  });

  test('axisInfo returns correct axes/signs for +Y', () => {
    expect(axisInfo('+Y')).toEqual({
      h: { axis: 'x', sign: 1 },
      v: { axis: 'z', sign: -1 }
    });
  });

  test('nearestPointOnLine clamps to segment end when outside', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 1, y: 0, z: 0 };
    const p = { x: 10, y: 0, z: 0 };
    expect(nearestPointOnLine(p, a, b)).toEqual(b);
  });
});

/* --------------------------------------------------------------- */
/*  SHEET UI BASICS                                                */
/* --------------------------------------------------------------- */

describe('sheet helpers (DOM)', () => {
  test('getCurrentSheet reads data-attributes correctly', () => {
    expect(getCurrentSheet()).toEqual({ id: 1, name: 'Sheet 1' });
  });

  test('updateSheetHeader writes the sheet name into #sheet-title', () => {
    // The header element starts empty (see setupJest).  After the call it
    // should contain the active sheet name.
    updateSheetHeader();
    expect(document.getElementById('sheet-title').textContent).toBe('Sheet 1');
  });
});

/* --------------------------------------------------------------- */
/*  WIDGETS                                                        */
/* --------------------------------------------------------------- */

describe('addNumberInput', () => {
  test('creates an <input> that mutates the supplied object', () => {
    const container = document.createElement('div');
    const obj = { foo: 0 };

    addNumberInput(container, 'Foo', 'foo', obj);

    const input = container.querySelector('input');
    input.value = '123';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(obj.foo).toBe(123);
  });
});

/* --------------------------------------------------------------- */
/*  SERVER INTERACTIONS (fetch-based)                              */
/* --------------------------------------------------------------- */

describe('server round-trips', () => {
  test('saveState() POSTs to /sheet/action', async () => {
    fetch.mockResponseOnce('{}'); // default success
    await saveState();
    expect(fetch).toHaveBeenCalledWith(
      '/sheet/action',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('solveModel() prints “Displacements:” block on success', async () => {
    fetch.mockResponseOnce(
      JSON.stringify({ displacements: { 0: [0, 0, 0] }, reactions: {} })
    );
    await solveModel();
    expect(
      document.getElementById('solve-output').textContent
    ).toMatch(/Displacements:/);
  });
});
