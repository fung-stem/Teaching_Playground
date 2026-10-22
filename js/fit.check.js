const assert = require("assert");
const ML = require("./fit.js");

function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) < tol, (msg || "") + " expected " + b + " got " + a);
}

const linePts = [0, 1, 2, 3].map(function (x) {
  return { x: x, y: 2 * x + 1 };
});
const line = ML.fitRegression(linePts, "line");
near(line.weights[0], 2, 1e-6, "line slope");
near(line.weights[1], 1, 1e-6, "line intercept");
near(line.mae, 0, 1e-6, "line mae");

const paraPts = [-2, -1, 0, 1, 2].map(function (x) {
  return { x: x, y: 3 * x * x - 2 * x + 7 };
});
const para = ML.fitRegression(paraPts, "parabola");
near(para.weights[0], 3, 1e-6, "parabola w1");
near(para.weights[1], -2, 1e-6, "parabola w2");
near(para.weights[2], 7, 1e-6, "parabola b");

const cubicPts = [-2, -1, 0, 1, 2, 3].map(function (x) {
  return { x: x, y: x * x * x - 4 * x + 2 };
});
const cubic = ML.fitRegression(cubicPts, "cubic");
near(cubic.weights[0], 1, 1e-5, "cubic w1");
near(cubic.weights[1], 0, 1e-5, "cubic w2");
near(cubic.weights[2], -4, 1e-5, "cubic w3");
near(cubic.weights[3], 2, 1e-5, "cubic b");

function dataset(task, id) {
  return ML[task].datasets.find(function (d) { return d.id === id; });
}

function acc(taskName, dataId, equation) {
  const pts = dataset(taskName, dataId).points;
  const fit = ML.fitClassification(pts, equation);
  return { fit: fit, ratio: fit.correct / fit.total };
}

const groupsLine = acc("classification", "groups", "line");
assert.strictEqual(groupsLine.ratio, 1, "two groups should be separated by a line");
assert.ok(groupsLine.fit.weights[0] < -0.6 && groupsLine.fit.weights[0] > -1.4, "slope " + groupsLine.fit.weights[0]);
assert.ok(groupsLine.fit.weights[1] > 6.5 && groupsLine.fit.weights[1] < 11, "intercept " + groupsLine.fit.weights[1]);

const bentLine = acc("classification", "bent", "line");
const bentPara = acc("classification", "bent", "parabola");
assert.ok(bentLine.ratio < 0.85, "a line should miss the bent groups, got " + bentLine.ratio);
assert.strictEqual(bentPara.ratio, 1, "a parabola should separate the bent groups");

const ringCircle = acc("classification", "ring", "circle");
const ringLine = acc("classification", "ring", "line");
assert.strictEqual(ringCircle.ratio, 1, "a circle should separate the ring");
assert.ok(ringLine.ratio < 0.8, "a line should miss the ring, got " + ringLine.ratio);
near(ringCircle.fit.circle.cx, 5, 0.35, "circle cx");
near(ringCircle.fit.circle.cy, 5, 0.35, "circle cy");
assert.ok(ringCircle.fit.circle.r > 1.8 && ringCircle.fit.circle.r < 2.8, "radius " + ringCircle.fit.circle.r);

const mixed = acc("classification", "mixed", "line");
assert.ok(mixed.ratio < 1 && mixed.ratio > 0.6, "overlap accuracy " + mixed.ratio);

const mixedOver = acc("classification", "mixed", "overfit");
assert.strictEqual(mixedOver.fit.weights.length, 45, "degree 8 has 45 weights");
assert.ok(mixedOver.fit.weights.every(function (w) { return isFinite(w); }), "overfit weights finite");
assert.ok(mixedOver.ratio > mixed.ratio, "high degree should fit the overlap better than a line");

const fourClass = acc("classification", "four", "line");
assert.strictEqual(dataset("classification", "four").points.length, 4);
assert.strictEqual(fourClass.ratio, 1, "four classification examples should be separable");
["parabola", "circle"].forEach(function (eq) {
  acc("classification", "four", eq);
});

const fourReg = dataset("regression", "four");
assert.strictEqual(fourReg.points.length, 4);
["line", "parabola", "cubic"].forEach(function (eq) {
  const fit = ML.fitRegression(fourReg.points, eq);
  assert.ok(isFinite(fit.mae), "four regression examples " + eq);
});

ML.classification.datasets.forEach(function (d) {
  d.points.forEach(function (p) {
    assert.ok(p.x > 0 && p.x < 10 && p.y > 0 && p.y < 10, d.id + " point outside " + JSON.stringify(p));
  });
});
ML.regression.datasets.forEach(function (d) {
  d.points.forEach(function (p) {
    assert.ok(p.x > -3.4 && p.x < 3.4 && p.y > -2 && p.y < 50, d.id + " point outside " + JSON.stringify(p));
  });
});

const uLine = ML.fitRegression(dataset("regression", "ushape").points, "line");
const uPara = ML.fitRegression(dataset("regression", "ushape").points, "parabola");
const uOver = ML.fitRegression(dataset("regression", "ushape").points, "overfit");
assert.ok(uPara.mae < 1.2, "U-shape parabola miss " + uPara.mae);
assert.ok(uPara.mae < uLine.mae * 0.4, "parabola should beat a line on the U-shape");
assert.strictEqual(uOver.weights.length, 13, "degree 12 has 13 weights");
assert.ok(uOver.mae < uPara.mae, "high degree should fit the U-shape training points more tightly");

const oddPts = dataset("regression", "odd").points;
const oddLine = ML.fitRegression(oddPts, "line");
const oddOver = ML.fitRegression(oddPts, "overfit");
assert.ok(oddOver.mae < oddLine.mae, "high degree should fit the odd example more tightly");
assert.ok(oddOver.predictY(0.2) > 30, "high degree should rise toward the odd example");

const sLine = ML.fitRegression(dataset("regression", "scurve").points, "line");
const sCubic = ML.fitRegression(dataset("regression", "scurve").points, "cubic");
assert.ok(sCubic.mae < sLine.mae * 0.55, "cubic should beat a line on the S-curve");

const scale = ML.makeScale({ x0: -4, x1: 4, y0: -4, y1: 4 }, { l: 0, t: 0, w: 400, h: 400 });
near(scale.px(1) - scale.px(0), scale.py(0) - scale.py(1), 1e-9, "equal scale");
near(scale.x(scale.px(1.5)), 1.5, 1e-9, "x roundtrip");
near(scale.y(scale.py(-2)), -2, 1e-9, "y roundtrip");

console.log("groups line", groupsLine.fit.weights.map(function (n) { return n.toFixed(2); }).join(", "), groupsLine.fit.correct + "/" + groupsLine.fit.total);
console.log("bent line", bentLine.ratio.toFixed(2), "parabola", bentPara.ratio.toFixed(2));
console.log("ring line", ringLine.ratio.toFixed(2), "circle r", ringCircle.fit.circle.r.toFixed(2));
console.log("mixed", mixed.ratio.toFixed(2));
console.log("U mae line", uLine.mae.toFixed(2), "parabola", uPara.mae.toFixed(2));
console.log("S mae line", sLine.mae.toFixed(2), "cubic", sCubic.mae.toFixed(2));
console.log("ok");
