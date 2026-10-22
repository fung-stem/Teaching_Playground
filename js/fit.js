(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MLFit = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function solve(matrix, vector) {
    const n = vector.length;
    const M = matrix.map(function (row, i) {
      return row.concat([vector[i]]);
    });
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      if (Math.abs(M[pivot][col]) < 1e-12) return null;
      if (pivot !== col) {
        const swap = M[col];
        M[col] = M[pivot];
        M[pivot] = swap;
      }
      const div = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] /= div;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col];
        if (factor === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    return M.map(function (row) {
      return row[n];
    });
  }

  // ponytail: tiny ridge so a flat column still returns numbers.
  // Upgrade path: a rank-revealing solver if datasets grow past a few dozen points.
  function leastSquares(rows, ys) {
    const p = rows[0].length;
    const xtx = [];
    const xty = [];
    for (let a = 0; a < p; a++) {
      xtx[a] = [];
      xty[a] = 0;
      for (let b = 0; b < p; b++) xtx[a][b] = 0;
    }
    for (let i = 0; i < rows.length; i++) {
      for (let a = 0; a < p; a++) {
        xty[a] += rows[i][a] * ys[i];
        for (let b = 0; b < p; b++) xtx[a][b] += rows[i][a] * rows[i][b];
      }
    }
    for (let a = 0; a < p; a++) xtx[a][a] += 1e-8;
    const weights = solve(xtx, xty);
    if (!weights) return new Array(p).fill(0);
    return weights;
  }

  function design(kind, x) {
    if (kind === "line") return [x, 1];
    if (kind === "parabola") return [x * x, x, 1];
    if (kind === "cubic") return [x * x * x, x * x, x, 1];
    throw new Error("Unknown equation: " + kind);
  }

  function evalPoly(weights, x) {
    let y = 0;
    for (let i = 0; i < weights.length; i++) y = y * x + weights[i];
    return y;
  }

  function scoreBoundary(points, weights) {
    let correct = 0;
    let margin = Infinity;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const signed = (p.cls === 1 ? 1 : -1) * (p.y - evalPoly(weights, p.x));
      if (signed > 1e-9) {
        correct++;
        if (signed < margin) margin = signed;
      }
    }
    // Margin is the gap on the correct side only, so one stray point does not drag the boundary.
    if (!isFinite(margin)) margin = 0;
    return { correct: correct, margin: margin };
  }

  function better(a, b) {
    if (a.correct !== b.correct) return a.correct > b.correct;
    return a.margin > b.margin + 1e-6;
  }

  function bestBias(points, weights) {
    const slope = weights.slice();
    slope[slope.length - 1] = 0;
    const rows = points.map(function (p) {
      return { r: p.y - evalPoly(slope, p.x), cls: p.cls };
    });
    const values = rows.map(function (row) {
      return row.r;
    }).sort(function (a, b) {
      return a - b;
    });
    const candidates = [values[0] - 1, values[values.length - 1] + 1];
    for (let i = 0; i < values.length - 1; i++) {
      candidates.push((values[i] + values[i + 1]) / 2);
    }
    let bestB = candidates[0];
    let best = null;
    for (let i = 0; i < candidates.length; i++) {
      const trial = slope.slice();
      trial[trial.length - 1] = candidates[i];
      const s = scoreBoundary(points, trial);
      if (!best || better(s, best)) {
        best = s;
        bestB = candidates[i];
      }
    }
    return bestB;
  }

  function polish(points, weights, kind) {
    const step0 = kind === "line" ? [0.2] : [0.03, 0.25];
    let current = weights.slice();
    current[current.length - 1] = bestBias(points, current);
    let step = 1;
    for (let pass = 0; pass < 7; pass++) {
      for (let j = 0; j < current.length - 1; j++) {
        for (let dir = -1; dir <= 1; dir += 2) {
          const trial = current.slice();
          trial[j] += dir * step0[j] * step;
          trial[trial.length - 1] = bestBias(points, trial);
          if (better(scoreBoundary(points, trial), scoreBoundary(points, current))) {
            current = trial;
          }
        }
      }
      step *= 0.5;
    }
    current[current.length - 1] = bestBias(points, current);
    return current;
  }

  function fitPolyClass(points, kind) {
    let bestW = null;
    let bestS = null;
    const margins = [0, 1.5, 3];
    for (let m = 0; m < margins.length; m++) {
      const rows = points.map(function (p) {
        return design(kind, p.x);
      });
      const ys = points.map(function (p) {
        const side = p.cls === 1 ? 1 : -1;
        return p.y - side * margins[m];
      });
      const polished = polish(points, leastSquares(rows, ys), kind);
      const s = scoreBoundary(points, polished);
      if (!bestS || better(s, bestS)) {
        bestS = s;
        bestW = polished;
      }
    }
    return bestW;
  }

  function fitCircle(points) {
    function scoreCenter(cx, cy) {
      const a = [];
      const b = [];
      for (let i = 0; i < points.length; i++) {
        const d = Math.hypot(points[i].x - cx, points[i].y - cy);
        if (points[i].cls === 0) a.push(d);
        else b.push(d);
      }
      if (!a.length || !b.length) {
        if (a.length) {
          return { cx: cx, cy: cy, r: Math.max.apply(null, a) + 0.45, acc: 1, gap: 0 };
        }
        const minB = Math.min.apply(null, b);
        return { cx: cx, cy: cy, r: Math.max(0.3, minB - 0.3), acc: 1, gap: 0 };
      }
      const maxA = Math.max.apply(null, a);
      const minB = Math.min.apply(null, b);
      if (minB > maxA + 1e-9) {
        return { cx: cx, cy: cy, r: (maxA + minB) / 2, acc: 1, gap: minB - maxA };
      }
      const items = points.map(function (p) {
        return { d: Math.hypot(p.x - cx, p.y - cy), cls: p.cls };
      }).sort(function (p, q) {
        return p.d - q.d;
      });
      let bestAcc = -1;
      let bestR = maxA;
      let bestGap = -Infinity;
      for (let i = 0; i <= items.length; i++) {
        const r = i === 0
          ? Math.max(0.2, items[0].d - 0.25)
          : i === items.length
            ? items[i - 1].d + 0.25
            : (items[i - 1].d + items[i].d) / 2;
        let ok = 0;
        for (let k = 0; k < items.length; k++) {
          const pred = items[k].d <= r ? 0 : 1;
          if (pred === items[k].cls) ok++;
        }
        const acc = ok / items.length;
        const gap = i > 0 && i < items.length ? items[i].d - items[i - 1].d : 0;
        if (acc > bestAcc + 1e-9 || (Math.abs(acc - bestAcc) < 1e-9 && gap > bestGap)) {
          bestAcc = acc;
          bestR = r;
          bestGap = gap;
        }
      }
      return { cx: cx, cy: cy, r: bestR, acc: bestAcc, gap: bestGap };
    }

    function betterCircle(a, b) {
      if (!b) return true;
      if (a.acc !== b.acc) return a.acc > b.acc;
      return a.gap > b.gap + 1e-6;
    }

    let best = null;
    function consider(cx, cy) {
      const s = scoreCenter(cx, cy);
      if (betterCircle(s, best)) best = s;
    }
    // ponytail: grid over centers. Fine while each dataset stays under ~80 points.
    for (let cx = 1; cx <= 9; cx += 0.5) {
      for (let cy = 1; cy <= 9; cy += 0.5) consider(cx, cy);
    }
    let step = 0.25;
    for (let pass = 0; pass < 5; pass++) {
      const cx = best.cx;
      const cy = best.cy;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) consider(cx + dx * step, cy + dy * step);
      }
      step *= 0.5;
    }
    return { cx: best.cx, cy: best.cy, r: Math.max(0.25, best.r) };
  }

  function countCorrect(points, predict) {
    let correct = 0;
    for (let i = 0; i < points.length; i++) {
      if (predict(points[i].x, points[i].y) === points[i].cls) correct++;
    }
    return correct;
  }

  function fitClassification(points, equation) {
    if (equation === "circle") {
      const circle = fitCircle(points);
      const predict = function (x, y) {
        return Math.hypot(x - circle.cx, y - circle.cy) <= circle.r ? 0 : 1;
      };
      return {
        equation: equation,
        weights: null,
        circle: circle,
        boundaryY: null,
        predict: predict,
        correct: countCorrect(points, predict),
        total: points.length,
      };
    }
    const weights = fitPolyClass(points, equation);
    const predict = function (x, y) {
      return y > evalPoly(weights, x) ? 1 : 0;
    };
    return {
      equation: equation,
      weights: weights,
      circle: null,
      boundaryY: function (x) {
        return evalPoly(weights, x);
      },
      predict: predict,
      correct: countCorrect(points, predict),
      total: points.length,
    };
  }

  function fitRegression(points, equation) {
    const rows = points.map(function (p) {
      return design(equation, p.x);
    });
    const ys = points.map(function (p) {
      return p.y;
    });
    const weights = leastSquares(rows, ys);
    const predictY = function (x) {
      return evalPoly(weights, x);
    };
    let absSum = 0;
    let ySum = 0;
    const abs = [];
    for (let i = 0; i < points.length; i++) {
      const miss = Math.abs(points[i].y - predictY(points[i].x));
      abs.push(miss);
      absSum += miss;
      ySum += points[i].y;
    }
    const mean = ySum / points.length;
    let baseSum = 0;
    for (let i = 0; i < points.length; i++) baseSum += Math.abs(points[i].y - mean);
    const sorted = abs.slice().sort(function (a, b) {
      return a - b;
    });
    const mid = Math.floor(sorted.length / 2);
    const medianAbs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return {
      equation: equation,
      weights: weights,
      predictY: predictY,
      mae: absSum / points.length,
      baselineMae: baseSum / points.length,
      maxAbs: sorted[sorted.length - 1],
      medianAbs: medianAbs,
      total: points.length,
    };
  }

  function makeScale(range, box) {
    return {
      px: function (x) {
        return box.l + ((x - range.x0) / (range.x1 - range.x0)) * box.w;
      },
      py: function (y) {
        return box.t + ((range.y1 - y) / (range.y1 - range.y0)) * box.h;
      },
      x: function (px) {
        return range.x0 + ((px - box.l) / box.w) * (range.x1 - range.x0);
      },
      y: function (py) {
        return range.y1 - ((py - box.t) / box.h) * (range.y1 - range.y0);
      },
    };
  }

  function sides(fn, spec) {
    return spec.map(function (s) {
      return { x: round2(s.x), y: round2(fn(s.x) + s.dy), cls: s.cls };
    });
  }

  function cloud(xs, fn, noise) {
    return xs.map(function (x, i) {
      return { x: round2(x), y: round2(fn(x) + noise[i]) };
    });
  }

  const lineGap = function (x) {
    return -x + 9;
  };

  const bentGap = function (x) {
    return 0.28 * (x - 5) * (x - 5) + 1.35;
  };

  function ringPoints() {
    const pts = [{ x: 5, y: 5, cls: 0 }];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.25;
      pts.push({
        x: round2(5 + 1.15 * Math.cos(a)),
        y: round2(5 + 1.15 * Math.sin(a)),
        cls: 0,
      });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push({
        x: round2(5 + 3.25 * Math.cos(a)),
        y: round2(5 + 3.25 * Math.sin(a)),
        cls: 1,
      });
    }
    return pts;
  }

  const classification = {
    range: { x0: 0, x1: 10, y0: 0, y1: 10 },
    xTicks: 2,
    yTicks: 2,
    xTitle: "Feature A (x)",
    yTitle: "Feature B (y)",
    defaultEquation: "line",
    defaultDataset: "groups",
    equations: [
      {
        id: "line",
        label: "Line:  y = wx + b",
      },
      {
        id: "parabola",
        label: "Parabola:  y = w₁x² + w₂x + b",
      },
      {
        id: "circle",
        label: "Circle:  (x − cₓ)² + (y − cᵧ)² = r²",
      },
    ],
    datasets: [
      {
        id: "groups",
        label: "Two groups",
        blurb: "Two categories with a straight gap between them. A line can separate them.",
        points: sides(lineGap, [
          { x: 1.1, dy: -5.4, cls: 0 },
          { x: 1.7, dy: -4.2, cls: 0 },
          { x: 2.2, dy: -5.6, cls: 0 },
          { x: 2.8, dy: -3.6, cls: 0 },
          { x: 3.3, dy: -4.4, cls: 0 },
          { x: 3.9, dy: -2.8, cls: 0 },
          { x: 1.4, dy: -6.2, cls: 0 },
          { x: 2.5, dy: -2.6, cls: 0 },
          { x: 4.4, dy: -2.4, cls: 0 },
          { x: 3.0, dy: -5.2, cls: 0 },
          { x: 3.4, dy: 2.2, cls: 1 },
          { x: 4.1, dy: 2.8, cls: 1 },
          { x: 4.8, dy: 1.9, cls: 1 },
          { x: 5.4, dy: 2.6, cls: 1 },
          { x: 6.0, dy: 1.7, cls: 1 },
          { x: 6.6, dy: 2.4, cls: 1 },
          { x: 7.2, dy: 3.0, cls: 1 },
          { x: 7.8, dy: 2.2, cls: 1 },
          { x: 5.0, dy: 3.3, cls: 1 },
          { x: 6.3, dy: 3.1, cls: 1 },
        ]),
      },
      {
        id: "bent",
        label: "Bent groups",
        blurb: "The gap dips in the middle and rises at the sides. A straight line cannot follow it.",
        points: sides(bentGap, [
          { x: 0.9, dy: -1.15, cls: 0 },
          { x: 2.0, dy: -1.05, cls: 0 },
          { x: 3.4, dy: -1.2, cls: 0 },
          { x: 5.0, dy: -0.85, cls: 0 },
          { x: 6.6, dy: -1.15, cls: 0 },
          { x: 8.0, dy: -1.0, cls: 0 },
          { x: 9.1, dy: -1.2, cls: 0 },
          { x: 4.2, dy: -1.0, cls: 0 },
          { x: 5.8, dy: -0.95, cls: 0 },
          { x: 1.4, dy: 1.35, cls: 1 },
          { x: 2.6, dy: 1.5, cls: 1 },
          { x: 5.0, dy: 1.25, cls: 1 },
          { x: 7.4, dy: 1.45, cls: 1 },
          { x: 8.7, dy: 1.3, cls: 1 },
          { x: 3.6, dy: 1.7, cls: 1 },
          { x: 6.2, dy: 1.55, cls: 1 },
          { x: 0.8, dy: 1.6, cls: 1 },
          { x: 9.2, dy: 1.45, cls: 1 },
        ]),
      },
      {
        id: "ring",
        label: "Ring",
        blurb: "Class A sits in the middle. Class B goes around it.",
        points: ringPoints(),
      },
      {
        id: "mixed",
        label: "Overlapping groups",
        blurb: "The categories mix along the gap, so a few examples stay on the wrong side.",
        points: [
          { x: 1.5, y: 2.0, cls: 0 },
          { x: 2.3, y: 2.7, cls: 0 },
          { x: 3.1, y: 1.8, cls: 0 },
          { x: 3.9, y: 2.9, cls: 0 },
          { x: 4.7, y: 2.2, cls: 0 },
          { x: 5.5, y: 3.0, cls: 0 },
          { x: 6.3, y: 2.3, cls: 0 },
          { x: 4.0, y: 7.3, cls: 0 },
          { x: 5.1, y: 6.7, cls: 0 },
          { x: 1.8, y: 7.5, cls: 1 },
          { x: 2.6, y: 6.5, cls: 1 },
          { x: 3.4, y: 7.8, cls: 1 },
          { x: 4.5, y: 6.9, cls: 1 },
          { x: 5.3, y: 7.7, cls: 1 },
          { x: 6.1, y: 6.6, cls: 1 },
          { x: 6.9, y: 7.4, cls: 1 },
          { x: 3.2, y: 2.5, cls: 1 },
          { x: 4.9, y: 3.1, cls: 1 },
        ],
      },
      {
        id: "four",
        label: "Four examples",
        blurb: "Two examples of each class, with empty space to add more.",
        points: [
          { x: 2, y: 2, cls: 0 },
          { x: 4, y: 3, cls: 0 },
          { x: 6, y: 7, cls: 1 },
          { x: 8, y: 8, cls: 1 },
        ],
      },
    ],
  };

  const regression = {
    range: { x0: -3.4, x1: 3.4, y0: -2, y1: 50 },
    xTicks: 1,
    yTicks: 10,
    xTitle: "input x",
    yTitle: "output y",
    defaultEquation: "parabola",
    defaultDataset: "ushape",
    equations: [
      {
        id: "line",
        label: "Line:  y = wx + b",
      },
      {
        id: "parabola",
        label: "Parabola:  y = w₁x² + w₂x + b",
      },
      {
        id: "cubic",
        label: "Cubic:  y = w₁x³ + w₂x² + w₃x + b",
      },
    ],
    datasets: [
      {
        id: "ushape",
        label: "U-shape",
        blurb: "The output is high at both ends and low in the middle.",
        points: cloud(
          [-3, -2.6, -2.2, -1.8, -1.4, -1, -0.6, -0.2, 0.2, 0.6, 1, 1.4, 1.8, 2.2, 2.6, 3],
          function (x) { return 4.6 * x * x + 0.5 * x + 1.4; },
          [0.8, -0.6, 0.5, -0.4, 0.7, -0.5, 0.3, -0.6, 0.4, -0.3, 0.6, -0.7, 0.4, -0.5, 0.8, -0.4]
        ),
      },
      {
        id: "straight",
        label: "Straight trend",
        blurb: "The output rises steadily as the input grows.",
        points: cloud(
          [-3, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3],
          function (x) { return 6 * x + 22; },
          [0.6, -0.8, 0.4, -0.5, 0.7, -0.3, 0.5, -0.6, 0.4, -0.7, 0.5]
        ),
      },
      {
        id: "scurve",
        label: "S-curve",
        blurb: "The output dips, levels off, then rises.",
        points: cloud(
          [-3, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3],
          function (x) { return 0.55 * x * x * x - 3.2 * x + 20; },
          [0.4, -0.5, 0.3, -0.4, 0.5, -0.2, 0.4, -0.5, 0.3, -0.4, 0.5]
        ),
      },
      {
        id: "odd",
        label: "One odd example",
        blurb: "Mostly a straight trend, plus one example far from the others.",
        points: cloud(
          [-2.8, -2.1, -1.4, -0.7, 0.2, 0.9, 1.6, 2.3, 3],
          function (x) { return -4 * x + 24; },
          [0.4, -0.5, 0.3, -0.4, 0.2, -0.3, 0.4, -0.2, 0.3]
        ).concat([{ x: 0.2, y: 46 }]),
      },
      {
        id: "four",
        label: "Four examples",
        blurb: "Four outputs, with empty space to add more.",
        points: [
          { x: -2.4, y: 8 },
          { x: -0.6, y: 20 },
          { x: 0.8, y: 12 },
          { x: 2.4, y: 28 },
        ],
      },
    ],
  };

  return {
    classification: classification,
    regression: regression,
    fitClassification: fitClassification,
    fitRegression: fitRegression,
    makeScale: makeScale,
    evalPoly: evalPoly,
  };
});
