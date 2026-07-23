const isIntersectBox = require('./isIntersectBox.js').default;

// Mock line element
class MockElement {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
  s() { return this.start; }
  e() { return this.end; }
  getControlPoints() { return []; }
  getBezierPoint(t) { return null; }
}

const element = new MockElement({x: 10, y: 10}, {x: 20, y: 20});
element.isIntersectBox = isIntersectBox.bind(element);

// Test 1: Normal zoom, cBox exactly surrounds it
let cBox = { x: 5, y: 5, w: 20, h: 20 };
console.log("Test 1 (Normal Zoom):", element.isIntersectBox(cBox)); // Should be true

// Test 2: User zoomed in 10x. 
// cBox physical size is 100x100. Logic size is 10x10.
// If logic cBox is inside, say x:12, y:12, w:10, h:10
cBox = { x: 12, y: 12, w: 10, h: 10 };
console.log("Test 2 (Zoomed In, partial cover):", element.isIntersectBox(cBox)); 

// Test 3: What if w or h is negative? (User dragged right to left)
cBox = { x: 25, y: 25, w: -20, h: -20 };
console.log("Test 3 (Negative w/h):", element.isIntersectBox(cBox));

// Test 4: Extreme tiny box due to massive zoom (globalZoom = 100)
cBox = { x: 14, y: 14, w: 2, h: 2 };
console.log("Test 4 (Tiny box, intersects line):", element.isIntersectBox(cBox));
