const exported = globalThis;       // the script augments the global object

// Shorthands that we really care about
const {
  projectPoint,
  unprojectDelta,
  distanceScreen,
  distanceToSegment2D,
  axisInfo,
  planeCorners,
  solidScreenRect,
  getCurrentSheet,
  updateSheetHeader,
  renderSheetList,
  createSheet,
  deleteSheet,
  ensureJointAt,
  getSnapPoints,
  applySnapping,
  buildModel,
  saveState,
  loadState,
  solveModel
} = exported;

beforeEach(() => {
  // ⟹ give every test a clean slate
  fetch.resetMocks();
  exported.elements  = [];
  exported.sheets    = [
    { id: 1, name: 'Sheet 1' },
    { id: 2, name: 'Sheet 2' }
  ];
  exported.sheetId   = 1;

  // Restore DOM mutations that previous specs may have changed
  document.getElementById('sheet-title').textContent = '';
  document.getElementById('sheet-list').innerHTML    = '';
  exported.currentView = '+X';
  exported.zoom        = 1;
  exported.panX = exported.panY = 0;
});

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                  */
/* ------------------------------------------------------------------ */

describe('geometry helpers', () => {
  // Truth-table for projectPoint / unprojectDelta               (✓ = spec passes)
  test.each([
    ['+X', { x: 0, y: 2,  z: 3 }, { x:  2, y: -3 }],
    ['-X', { x: 0, y: 2,  z: 3 }, { x: -2, y: -3 }],
    ['+Y', { x: 1, y: 0,  z: 3 }, { x:  1, y: -3 }],
    ['-Y', { x: 1, y: 0,  z: 3 }, { x: -1, y: -3 }],
    ['+Z', { x: 1, y: 2,  z: 0 }, { x:  1, y: -2 }],
    ['-Z', { x: 1, y: 2,  z: 0 }, { x: -1, y: -2 }]
  ])('projectPoint %s', (view, p, expected) => {
    exported.currentView = view;
    expect(projectPoint(p)).toEqual(expected);
  });

  it('unprojectDelta maps screen Δ back to world Δ consistently', () => {
    exported.currentView = '+Z';      // (x,y) plane visible
    const worldDelta = unprojectDelta(5, -7);
    expect(worldDelta).toEqual({ x: 5, y: 7 });
  });

  it('distanceScreen obeys Pythagoras', () => {
    expect(distanceScreen({ x: 0, y: 0 }, { x: 3, y: 4 }))
      .toBeCloseTo(5);
  });

  it('distanceToSegment2D is zero for on-segment point', () => {
    const a = { x: 0, y: 0 }, b = { x: 4, y: 0 }, p = { x: 2, y: 0 };
    expect(distanceToSegment2D(p, a, b)).toBeCloseTo(0);
  });

  it('axisInfo returns orthogonal axes/signs for +Y view', () => {
    expect(axisInfo('+Y')).toEqual({
      h: { axis: 'x', sign:  1 },
      v: { axis: 'z', sign: -1 }
    });
  });

  it('solidScreenRect halves the on-screen width/height correctly', () => {
    // stub screenCoords => object centre (0,0)
    const originalSC = exported.screenCoords;
    exported.screenCoords = () => ({ x: 0, y: 0 });

    exported.currentView = '+X';           // h-axis = y ⇒ uses width
    const rect = solidScreenRect({ x: 0, y: 0, z: 0, width: 20, height: 30, depth: 40 });
    expect(rect.right - rect.left).toBeCloseTo(20);     // width
    exported.screenCoords = originalSC;
  });

  it('planeCorners makes a square of correct half-sizes for Z-normal plane', () => {
    const cs = planeCorners({ x: 0, y: 0, z: 0, length: 20, width: 10 });
    expect(cs).toContainEqual({ x: -10, y: -5, z: 0 });
    expect(cs).toHaveLength(4);
  });
});

/* ------------------------------------------------------------------ */
/*  Sheet list / header helpers                                       */
/* ------------------------------------------------------------------ */

describe('sheet helpers', () => {
  it('getCurrentSheet returns the active sheet object', () => {
    expect(getCurrentSheet()).toMatchObject({ id: 1, name: 'Sheet 1' });
  });

  it('updateSheetHeader writes the sheet name into #sheet-title', () => {
    updateSheetHeader();
    expect(document.getElementById('sheet-title').textContent)
      .toBe('Sheet 1');
  });

  it('renderSheetList renders <li> items and highlights active sheet', () => {
    renderSheetList();
    const items = [...document.querySelectorAll('#sheet-list li')];
    expect(items.map(li => li.textContent.trim())).toEqual(['Sheet 1', 'Sheet 2']);
    expect(items[0].classList.contains('active')).toBe(true);
  });

  it('createSheet pushes a new sheet and updates sheetId', async () => {
    // first mock: POST /sheet
    fetch.mockResponseOnce(JSON.stringify({ id: 3, name: 'Untitled' }));
    // second mock: GET /sheet/3 from loadState()
    fetch.mockResponseOnce(JSON.stringify({ id: 3, name: 'Untitled', elements: [] }));

    // fake loadState so we don’t depend on network JSON structure
    const loadSpy = jest.spyOn(exported, 'loadState').mockResolvedValue();

    const previousCount = exported.sheets.length;
    await createSheet();                      // await ensures the promise chain finished

    expect(exported.sheets).toHaveLength(previousCount + 1);
    expect(exported.sheetId).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(1);   // only POST because loadState is stubbed

    loadSpy.mockRestore();
  });

  it('deleteSheet removes sheet and selects the first remaining', async () => {
    fetch.mockResponseOnce('', { status: 200 });
    await deleteSheet(2);
    expect(exported.sheets.map(s => s.id)).toEqual([1]);
    expect(exported.sheetId).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Snapping & element helpers                                        */
/* ------------------------------------------------------------------ */

describe('snapping helpers', () => {
  it('ensureJointAt only creates a joint if no existing one is nearby', () => {
    exported.elements.push({ id: 42, type: 'Joint', x: 0, y: 0, z: 0 });
    ensureJointAt(0, 0, 0);                 // duplicate – should be ignored
    ensureJointAt(1, 0, 0);                 // new joint
    expect(exported.elements.filter(e => e.type === 'Joint')).toHaveLength(2);
  });

  it('getSnapPoints excludes elements whose id is ignored', () => {
    exported.elements.push(
      { id: 10, type: 'Joint', x: 0, y: 0, z: 0 },
      { id: 11, type: 'Joint', x: 1, y: 0, z: 0 }
    );
    const ptsAll   = getSnapPoints();        // nothing ignored
    const ptsNo10  = getSnapPoints(10);      // ignore first
    expect(ptsAll.length).toBeGreaterThan(ptsNo10.length);
  });

  it('applySnapping moves a member end onto an existing joint within tolerance', () => {
    // existing snap-target
    exported.elements.push({ id: 90, type: 'Joint', x: 0, y: 0, z: 0 });

    // member whose first point is almost at (0,0,0)
    const member = {
      id: 91,
      type: 'Member',
      x: 0.05, y: 0, z: 0,
      x2: 5,   y2: 0, z2: 0
    };
    exported.elements.push(member);

    // make screenCoords return pixel-distance = 0.5 SNAP_PIXELS so that snapping triggers
    const originalSC = exported.screenCoords;
    exported.screenCoords = ({ x, y }) => ({ x: x * 10, y: y * 10 });

    applySnapping(member);
    expect(member.x).toBeCloseTo(0);         // snapped to the joint

    exported.screenCoords = originalSC;
  });
});

/* ------------------------------------------------------------------ */
/*  Model builder + server round-trips                                */
/* ------------------------------------------------------------------ */

describe('model builder & persistence', () => {
  it('buildModel collects joints and members correctly', () => {
    exported.elements.push(
      { id: 1, type: 'Joint',  x: 0, y: 0, z: 0 },
      { id: 2, type: 'Member', x: 0, y: 0, z: 0, x2: 1, y2: 0, z2: 0 }
    );
    const mdl = buildModel();
    expect(mdl.joints).toHaveLength(2);      // (0,0) and (1,0)
    expect(mdl.members).toHaveLength(1);
  });

  it('saveState performs a POST to /sheet/action', async () => {
    fetch.mockResponseOnce('{}');
    await saveState();
    expect(fetch).toHaveBeenCalledWith(
      '/sheet/action',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('loadState replaces the global elements array', async () => {
    const payload = {
      id: 1,
      name: 'Sheet 1',
      elements: [{ id: 1, type: 'Joint', x: 2, y: 2, z: 0 }]
    };
    fetch.mockResponseOnce(JSON.stringify(payload));
    await loadState();
    expect(exported.elements).toHaveLength(1);
    expect(exported.elements[0]).toMatchObject({ x: 2, y: 2 });
  });

  it('solveModel writes a minimally formatted result to #solve-output', async () => {
    fetch.mockResponseOnce(JSON.stringify({
      displacements: { 0:[0,0,0] },
      reactions:     { 0:[0,0,0] }
    }));
    await solveModel();
    const txt = document.getElementById('solve-output').textContent;
    expect(txt).toMatch(/Displacements:/);
    expect(txt).toMatch(/Reactions:/);
  });
});
