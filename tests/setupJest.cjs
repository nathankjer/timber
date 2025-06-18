// tests/setupJest.cjs
const fetchMock = require('jest-fetch-mock');
fetchMock.enableMocks();

// ──────────────────────────────────────────────────────────────────────────────
// 👇 Add this DEFAULT response *before* importing your module
fetchMock.mockResponse(async req => {
  // if you want to distinguish create/delete/solve endpoints you can:
  if (req.url.match(/^\/sheet\/\d+$/)) {
    return JSON.stringify({ id: 1, name: 'Sheet 1', elements: [] });
  }
  // fallback for any other fetch (POST /sheet/action, /solve, …)
  return JSON.stringify({});
});
// ──────────────────────────────────────────────────────────────────────────────

global.alert   = jest.fn();
global.prompt  = jest.fn();

// --- Start of DOM stub ---
document.body.innerHTML = `
  <div data-sheet-id="1" data-sheets='[{"id":1,"name":"Sheet 1"}]'></div>
  <span id="sheet-title"></span>
  <ul id="sheet-list"></ul>
  
  <!-- Newly added elements from your real HTML -->
  <button id="new-sheet"></button>
  <i id="edit-title"></i>
  <div class="btn-group">
    <button class="view-btn" data-view="+X"></button>
    <button class="view-btn" data-view="-X"></button>
    <!-- etc. -->
  </div>
  <span id="current-view">+X</span>
  
  <svg id="canvas"></svg>
  <select id="element-type"></select>
  <button id="add-btn"></button>
  <button id="delete-btn"></button>
  <button id="solve-btn"></button>
  <pre id="solve-output"></pre>
  
  <div id="props-content"></div>
`;
// --- End of DOM stub ---

// Ensure screenCoords has dimensions to work with
Element.prototype.getBoundingClientRect = () => ({
  width: 800, height: 600, left: 0, top: 0
});

// Load your script *as if* it were a plain <script>.
// That way, each `function foo(){}` becomes `globalThis.foo = …`.
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const code = fs.readFileSync(
  path.resolve(__dirname, '../src/static/index.js'),
  'utf8'
);

// Run in the *current* context (globalThis)
// so all top-level bindings go to globalThis.
vm.runInThisContext(code, { filename: 'index.js' });