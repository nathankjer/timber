// tests/setupJest.js
import fetchMock from 'jest-fetch-mock';
fetchMock.enableMocks();

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

// Now load your script against the stubbed DOM
await import('../src/static/index.js');
