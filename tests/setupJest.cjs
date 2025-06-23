// tests/setupJest.cjs
const fetchMock = require("jest-fetch-mock");
fetchMock.enableMocks();

// 1) default every fetch to valid JSON
fetchMock.mockResponse(async (req) => {
  return JSON.stringify({});
});

// 2) stub out alert / prompt so they don't interrupt the tests
global.alert = jest.fn();
global.prompt = jest.fn();

// 3) minimal DOM stub that index.js expects
document.body.innerHTML = `
  <div data-sheet-id="1" data-sheets='[{"id":1,"name":"Sheet 1"}]'></div>
  <span id="sheet-title"></span>
  <ul   id="sheet-list"></ul>
  <button id="new-sheet"></button>
  <i      id="edit-title"></i>
  <div class="btn-group">
    <button class="view-btn" data-view="+Z"></button>
    <button class="view-btn" data-view="-Z"></button>
  </div>
  <div class="btn-group">
    <button id="zoom-in"></button>
    <button id="zoom-out"></button>
    <button id="home-btn"></button>
  </div>
  <span id="current-view">+Z</span>
  <svg    id="canvas"></svg>
  <select id="element-type"></select>
  <button id="add-btn"></button>
  <button id="delete-btn"></button>
  <button id="solve-btn"></button>
  <pre    id="solve-output"></pre>
  <div   id="props-content"></div>
`;

// 4) ensure <svg> has dimensions
Element.prototype.getBoundingClientRect = () => ({
  width: 800,
  height: 600,
  left: 0,
  top: 0,
});

// 5) initialize global variables that the code expects
// (Do not set global.elements or global.selectedId here, let the code define them)
global.globalProps = { g: 9.81, units: "metric" };
global.unitConversionInfo = null;
global.isRenderingProperties = false;
global.sheets = [];
global.sheetId = 1;
global.nextId = Date.now();
global.currentView = "+Z";
global.rotationX = 0;
global.rotationY = 0;
global.rotationZ = 0;
global.isRotating = false;
global.rotationStartX = 0;
global.rotationStartY = 0;
global.rotationOrigX = 0;
global.rotationOrigY = 0;
global.rotationOrigZ = 0;
global.zoom = 1;
global.panX = 0;
global.panY = 0;
global.panStartX = 0;
global.panStartY = 0;
global.panOrigX = 0;
global.panOrigY = 0;
global.isPanning = false;
global.dragId = null;
global.dragStartX = 0;
global.dragStartY = 0;
global.dragOrig = null;
global.dragMode = "body";
global.lastCalculationResults = null;

// 5) load index.js via a VM sandbox so its top-level defs go into that sandbox
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// read your production code
const code = fs.readFileSync(
  path.resolve(__dirname, "../src/static/index.js"),
  "utf8",
);

// create a fresh sandbox and seed it with *all* current globals
const sandbox = {};
for (const key of Object.getOwnPropertyNames(global)) {
  sandbox[key] = global[key];
}

// turn it into a real VM context
vm.createContext(sandbox);

// run the code in that context
vm.runInContext(code, sandbox, { filename: "index.js" });

// copy *everything* from the sandbox back onto real globalThis
// so tests can refer to getCurrentSheet(), projectPoint(), etc.
for (const key of Object.getOwnPropertyNames(sandbox)) {
  global[key] = sandbox[key];
}
// Ensure elements and selectedId are shared
if (sandbox.elements) global.elements = sandbox.elements;
if (sandbox.selectedId !== undefined) global.selectedId = sandbox.selectedId;
