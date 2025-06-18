const fetchMock = require('jest-fetch-mock');

fetchMock.enableMocks();            // mock global fetch
global.alert   = jest.fn();         // silence alert / prompt in tests
global.prompt  = jest.fn();

// A tiny page-stub that satisfies every querySelector / getElementById
document.body.innerHTML = `
  <div data-sheet-id="1" data-sheets='[{"id":1,"name":"Sheet 1"}]'></div>
  <span id="sheet-title"></span>
  <ul id="sheet-list"></ul>

  <svg id="canvas"></svg>

  <button id="add-btn"></button>
  <button id="delete-btn"></button>
  <button id="solve-btn"></button>
  <select id="element-type"></select>

  <div id="props-content"></div>
`;

// Give <svg> a size so screenCoords() works
Element.prototype.getBoundingClientRect = () => ({
  width: 800,
  height: 600,
  left: 0,
  top: 0
});

require('../../src/static/index.js');
