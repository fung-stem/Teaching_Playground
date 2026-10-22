(function () {
  "use strict";

  const tasks = {
    classification: Object.assign({ added: [], placeClass: 0, hover: null }, sideDefaults("classification")),
    regression: Object.assign({ added: [], hover: null }, sideDefaults("regression")),
  };

  function sideDefaults(name) {
    const spec = MLFit[name];
    return {
      equation: spec.defaultEquation,
      dataset: spec.defaultDataset,
      note: "Click the plot to add an example.",
    };
  }

  const ui = {
    classification: {
      equation: document.getElementById("cls-equation"),
      dataset: document.getElementById("cls-dataset"),
      equationText: document.getElementById("cls-equation-text"),
      weights: document.getElementById("cls-weights"),
      score: document.getElementById("cls-score"),
      canvas: document.getElementById("cls-plot"),
      cursor: document.getElementById("cls-cursor"),
      undo: document.getElementById("cls-undo"),
      clear: document.getElementById("cls-clear"),
    },
    regression: {
      equation: document.getElementById("reg-equation"),
      dataset: document.getElementById("reg-dataset"),
      equationText: document.getElementById("reg-equation-text"),
      weights: document.getElementById("reg-weights"),
      score: document.getElementById("reg-score"),
      canvas: document.getElementById("reg-plot"),
      cursor: document.getElementById("reg-cursor"),
      undo: document.getElementById("reg-undo"),
      clear: document.getElementById("reg-clear"),
    },
  };

  function fillSelect(select, items, selected) {
    select.replaceChildren();
    items.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      if (item.id === selected) option.selected = true;
      select.appendChild(option);
    });
  }

  function num(n) {
    if (!isFinite(n) || Math.abs(n) < 0.005) return "0.00";
    const text = Math.abs(Math.round(n * 100) / 100).toFixed(2);
    return n < 0 ? "−" + text : text;
  }

  function term(coef, symbol, first) {
    const value = Math.abs(coef) < 0.005 ? 0 : coef;
    const mag = Math.abs(value).toFixed(2) + symbol;
    if (first) return (value < 0 ? "−" : "") + mag;
    return (value < 0 ? " − " : " + ") + mag;
  }

  function polyText(weights, symbols) {
    let text = "y = ";
    for (let i = 0; i < weights.length; i++) {
      text += term(weights[i], symbols[i], i === 0);
    }
    return text;
  }

  function equationText(model) {
    if (model.circle) {
      const c = model.circle;
      return centerTerm("x", c.cx) + "² + " + centerTerm("y", c.cy) + "² = " + num(c.r) + "²";
    }
    if (model.equation === "overfit") {
      if (model.field) return "degree " + model.degree + " in x and y = 0";
      return "y = w₁x¹² + … + b";
    }
    if (model.equation === "line") return polyText(model.weights, ["x", ""]);
    if (model.equation === "parabola") return polyText(model.weights, ["x²", "x", ""]);
    return polyText(model.weights, ["x³", "x²", "x", ""]);
  }

  function centerTerm(axis, value) {
    const v = Math.abs(value) < 0.005 ? 0 : value;
    if (v < 0) return "(" + axis + " + " + Math.abs(v).toFixed(2) + ")";
    return "(" + axis + " − " + v.toFixed(2) + ")";
  }

  function weightRows(model) {
    if (model.circle) {
      return [
        ["cₓ", model.circle.cx],
        ["cᵧ", model.circle.cy],
        ["r", model.circle.r],
      ];
    }
    if (model.equation === "overfit") return [["weights", model.weights.length]];
    const names = model.equation === "line"
      ? ["w", "b"]
      : model.equation === "parabola"
        ? ["w₁", "w₂", "b"]
        : ["w₁", "w₂", "w₃", "b"];
    return names.map(function (name, i) {
      return [name, model.weights[i]];
    });
  }

  function datasetOf(name, id) {
    return MLFit[name].datasets.find(function (d) { return d.id === id; });
  }

  function allPoints(name) {
    const side = tasks[name];
    return datasetOf(name, side.dataset).points.concat(side.added);
  }

  function errorText(n) {
    return (Math.round(n * 10) / 10).toFixed(1);
  }

  function fillReadout(name) {
    const side = tasks[name];
    const view = ui[name];
    const model = side.model;
    view.equationText.textContent = equationText(model);
    view.weights.replaceChildren();
    weightRows(model).forEach(function (row) {
      const wrap = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = row[0] + " = ";
      dd.textContent = row[0] === "weights" ? String(row[1]) : num(row[1]);
      wrap.append(dt, dd);
      view.weights.appendChild(wrap);
    });
    if (name === "classification") {
      view.score.textContent = "Correctly classified: " + model.correct + " of " + model.total;
      view.canvas.setAttribute("aria-label",
        "Classification plot. Correctly classified: " + model.correct + " of " + model.total + ".");
    } else {
      view.score.textContent = "Mean absolute error: " + errorText(model.mae);
      view.canvas.setAttribute("aria-label",
        "Regression plot. Mean absolute error " + errorText(model.mae) + ".");
    }
    view.cursor.textContent = side.note;
    view.undo.disabled = side.added.length === 0;
    view.clear.disabled = side.added.length === 0;
  }

  function plotBox(w, h) {
    const ml = 78;
    const mr = 14;
    const mt = 12;
    const mb = 46;
    const aw = Math.max(20, w - ml - mr);
    const ah = Math.max(20, h - mt - mb);
    const size = Math.min(aw, ah);
    return {
      l: ml + (aw - size) / 2,
      t: mt + (ah - size) / 2,
      w: size,
      h: size,
    };
  }

  function sizeCanvas(canvas) {
    const width = canvas.clientWidth || 320;
    const height = width;
    canvas.style.height = height + "px";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: width, h: height };
  }

  function ticks(a, b, step) {
    const out = [];
    const start = Math.ceil((a - 1e-9) / step) * step;
    for (let v = start; v <= b + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
    return out;
  }

  function drawFrame(ctx, spec, box, scale) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t, box.w, box.h);
    ctx.clip();
    ticks(spec.range.x0, spec.range.x1, spec.xTicks).forEach(function (v) {
      ctx.strokeStyle = Math.abs(v) < 1e-6 ? "#d5d5d5" : "#ececec";
      ctx.lineWidth = 1;
      const x = scale.px(v);
      ctx.beginPath();
      ctx.moveTo(x, box.t);
      ctx.lineTo(x, box.t + box.h);
      ctx.stroke();
    });
    ticks(spec.range.y0, spec.range.y1, spec.yTicks).forEach(function (v) {
      ctx.strokeStyle = Math.abs(v) < 1e-6 ? "#d5d5d5" : "#ececec";
      ctx.lineWidth = 1;
      const y = scale.py(v);
      ctx.beginPath();
      ctx.moveTo(box.l, y);
      ctx.lineTo(box.l + box.w, y);
      ctx.stroke();
    });
    ctx.restore();

    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(box.l, box.t, box.w, box.h);

    ctx.fillStyle = "#333";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "top";
    ticks(spec.range.x0, spec.range.x1, spec.xTicks).forEach(function (v) {
      const x = scale.px(v);
      ctx.textAlign = "center";
      if (v <= spec.range.x0 + 1e-6) ctx.textAlign = "left";
      if (v >= spec.range.x1 - 1e-6) ctx.textAlign = "right";
      ctx.fillText(String(v), x, box.t + box.h + 6);
    });
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const originIsCorner = Math.abs(spec.range.x0) < 1e-6 && Math.abs(spec.range.y0) < 1e-6;
    ticks(spec.range.y0, spec.range.y1, spec.yTicks).forEach(function (v) {
      if (originIsCorner && Math.abs(v) < 1e-6) return;
      ctx.fillText(String(v), box.l - 8, scale.py(v));
    });

    ctx.save();
    ctx.fillStyle = "#333";
    ctx.font = "13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(16, box.t + box.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(spec.yTitle, 0, 0);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(spec.xTitle, box.l + box.w / 2, box.t + box.h + 36);
  }

  function drawCurve(ctx, box, scale, range, yAt, color) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t, box.w, box.h);
    ctx.clip();
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const x = range.x0 + (range.x1 - range.x0) * (i / steps);
      const px = scale.px(x);
      const py = scale.py(yAt(x));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawDot(ctx, x, y, color, added, wrong) {
    ctx.beginPath();
    if (added) {
      ctx.rect(x - 6, y - 6, 12, 12);
    } else {
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    if (wrong) {
      ctx.beginPath();
      if (added) ctx.rect(x - 8, y - 8, 16, 16);
      else ctx.arc(x, y, 8.5, 0, Math.PI * 2);
      ctx.strokeStyle = "#161616";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function ensureHighDegree(box, range, model) {
    const w = Math.round(box.w);
    const h = Math.round(box.h);
    if (model.shade && model.shade.w === w && model.shade.h === h) return model.shade;
    const n = 120;
    const xs = [];
    const ys = [];
    const g = [];
    for (let i = 0; i <= n; i++) xs.push(range.x0 + (range.x1 - range.x0) * i / n);
    for (let j = 0; j <= n; j++) ys.push(range.y0 + (range.y1 - range.y0) * j / n);
    for (let j = 0; j <= n; j++) {
      g[j] = [];
      for (let i = 0; i <= n; i++) g[j][i] = model.field(xs[i], ys[j]);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ictx = canvas.getContext("2d");
    ictx.scale(dpr, dpr);
    ictx.fillStyle = "rgba(44, 123, 182, 0.16)";
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (g[j][i] > 0) continue;
        const x0 = (xs[i] - range.x0) / (range.x1 - range.x0) * w;
        const x1 = (xs[i + 1] - range.x0) / (range.x1 - range.x0) * w;
        const y0 = (range.y1 - ys[j]) / (range.y1 - range.y0) * h;
        const y1 = (range.y1 - ys[j + 1]) / (range.y1 - range.y0) * h;
        ictx.fillRect(x0, Math.min(y0, y1), x1 - x0 + 0.6, Math.abs(y1 - y0) + 0.6);
      }
    }
    function cross(x0, y0, x1, y1, v0, v1) {
      const t = v0 / (v0 - v1);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    const segments = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const v00 = g[j][i];
        const v10 = g[j][i + 1];
        const v11 = g[j + 1][i + 1];
        const v01 = g[j + 1][i];
        const pts = [];
        if (v00 * v10 < 0) pts.push(cross(xs[i], ys[j], xs[i + 1], ys[j], v00, v10));
        if (v10 * v11 < 0) pts.push(cross(xs[i + 1], ys[j], xs[i + 1], ys[j + 1], v10, v11));
        if (v01 * v11 < 0) pts.push(cross(xs[i], ys[j + 1], xs[i + 1], ys[j + 1], v01, v11));
        if (v00 * v01 < 0) pts.push(cross(xs[i], ys[j], xs[i], ys[j + 1], v00, v01));
        for (let k = 0; k + 1 < pts.length; k += 2) segments.push([pts[k], pts[k + 1]]);
      }
    }
    model.shade = { w: w, h: h, canvas: canvas, segments: segments };
    return model.shade;
  }

  function drawHighDegree(ctx, box, range, model) {
    const shade = ensureHighDegree(box, range, model);
    ctx.drawImage(shade.canvas, box.l, box.t, box.w, box.h);
  }

  function strokeHighDegree(ctx, box, scale, range, model) {
    const shade = ensureHighDegree(box, range, model);
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t, box.w, box.h);
    ctx.clip();
    ctx.beginPath();
    shade.segments.forEach(function (seg) {
      ctx.moveTo(scale.px(seg[0][0]), scale.py(seg[0][1]));
      ctx.lineTo(scale.px(seg[1][0]), scale.py(seg[1][1]));
    });
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  function paintClassification() {
    const side = tasks.classification;
    const view = ui.classification;
    const spec = MLFit.classification;
    const model = side.model;
    const sized = sizeCanvas(view.canvas);
    const ctx = sized.ctx;
    const box = plotBox(sized.w, sized.h);
    const scale = MLFit.makeScale(spec.range, box);
    ctx.clearRect(0, 0, sized.w, sized.h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(box.l, box.t, box.w, box.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t, box.w, box.h);
    ctx.clip();
    ctx.fillStyle = "rgba(214, 60, 48, 0.13)";
    ctx.fillRect(box.l, box.t, box.w, box.h);
    ctx.fillStyle = "rgba(44, 123, 182, 0.16)";
    if (model.field) {
      drawHighDegree(ctx, box, spec.range, model);
    } else if (model.circle) {
      const c = model.circle;
      const rx = Math.abs(scale.px(c.cx + c.r) - scale.px(c.cx));
      const ry = Math.abs(scale.py(c.cy + c.r) - scale.py(c.cy));
      ctx.beginPath();
      ctx.ellipse(scale.px(c.cx), scale.py(c.cy), rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(scale.px(spec.range.x0), scale.py(spec.range.y0));
      const steps = 100;
      for (let i = 0; i <= steps; i++) {
        const x = spec.range.x0 + (spec.range.x1 - spec.range.x0) * (i / steps);
        ctx.lineTo(scale.px(x), scale.py(model.boundaryY(x)));
      }
      ctx.lineTo(scale.px(spec.range.x1), scale.py(spec.range.y0));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    drawFrame(ctx, spec, box, scale);
    if (model.field) {
      strokeHighDegree(ctx, box, scale, spec.range, model);
    } else if (model.circle) {
      const c = model.circle;
      const rx = Math.abs(scale.px(c.cx + c.r) - scale.px(c.cx));
      const ry = Math.abs(scale.py(c.cy + c.r) - scale.py(c.cy));
      ctx.save();
      ctx.beginPath();
      ctx.rect(box.l, box.t, box.w, box.h);
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(scale.px(c.cx), scale.py(c.cy), rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    } else {
      drawCurve(ctx, box, scale, spec.range, model.boundaryY, "#222");
    }
    allPoints("classification").forEach(function (p) {
      const wrong = model.predict(p.x, p.y) !== p.cls;
      drawDot(ctx, scale.px(p.x), scale.py(p.y), p.cls === 0 ? "#2c7bb6" : "#d63c30", !!p.added, wrong);
    });
    if (side.hover) {
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(scale.px(side.hover.x), box.t);
      ctx.lineTo(scale.px(side.hover.x), box.t + box.h);
      ctx.moveTo(box.l, scale.py(side.hover.y));
      ctx.lineTo(box.l + box.w, scale.py(side.hover.y));
      ctx.stroke();
      ctx.restore();
    }
    side.box = box;
  }

  function paintRegression() {
    const side = tasks.regression;
    const view = ui.regression;
    const spec = MLFit.regression;
    const model = side.model;
    const sized = sizeCanvas(view.canvas);
    const ctx = sized.ctx;
    const box = plotBox(sized.w, sized.h);
    const scale = MLFit.makeScale(spec.range, box);
    ctx.clearRect(0, 0, sized.w, sized.h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(box.l, box.t, box.w, box.h);
    drawFrame(ctx, spec, box, scale);

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t, box.w, box.h);
    ctx.clip();
    ctx.strokeStyle = "rgba(214, 60, 48, 0.45)";
    ctx.lineWidth = 1;
    allPoints("regression").forEach(function (p) {
      ctx.beginPath();
      ctx.moveTo(scale.px(p.x), scale.py(p.y));
      ctx.lineTo(scale.px(p.x), scale.py(model.predictY(p.x)));
      ctx.stroke();
    });
    ctx.restore();

    drawCurve(ctx, box, scale, spec.range, model.predictY, "#d63c30");
    allPoints("regression").forEach(function (p) {
      drawDot(ctx, scale.px(p.x), scale.py(p.y), "#2c7bb6", !!p.added, false);
    });
    if (side.hover) {
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(scale.px(side.hover.x), box.t);
      ctx.lineTo(scale.px(side.hover.x), box.t + box.h);
      ctx.moveTo(box.l, scale.py(side.hover.y));
      ctx.lineTo(box.l + box.w, scale.py(side.hover.y));
      ctx.stroke();
      ctx.restore();
    }
    side.box = box;
  }

  function recompute() {
    tasks.classification.model = MLFit.fitClassification(allPoints("classification"), tasks.classification.equation);
    tasks.regression.model = MLFit.fitRegression(allPoints("regression"), tasks.regression.equation);
    fillReadout("classification");
    fillReadout("regression");
    paintClassification();
    paintRegression();
  }

  function eventPoint(name, event) {
    const canvas = ui[name].canvas;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const box = tasks[name].box;
    if (!box || px < box.l || py < box.t || px > box.l + box.w || py > box.t + box.h) return null;
    const scale = MLFit.makeScale(MLFit[name].range, box);
    return {
      x: Math.round(scale.x(px) * 100) / 100,
      y: Math.round(scale.y(py) * 100) / 100,
    };
  }

  function bindPlot(name) {
    const canvas = ui[name].canvas;
    canvas.addEventListener("pointermove", function (event) {
      const point = eventPoint(name, event);
      tasks[name].hover = point;
      if (point) {
        tasks[name].note = "x = " + point.x.toFixed(2) + ",  y = " + point.y.toFixed(2);
        ui[name].cursor.textContent = tasks[name].note;
      }
      if (name === "classification") paintClassification();
      else paintRegression();
    });
    canvas.addEventListener("pointerleave", function () {
      tasks[name].hover = null;
      tasks[name].note = "Click the plot to add an example.";
      ui[name].cursor.textContent = tasks[name].note;
      if (name === "classification") paintClassification();
      else paintRegression();
    });
    canvas.addEventListener("click", function (event) {
      const point = eventPoint(name, event);
      if (!point) return;
      if (name === "classification") {
        point.cls = tasks.classification.placeClass;
        point.added = true;
        const label = point.cls === 0 ? "Class A" : "Class B";
        tasks.classification.note = "Added a " + label + " example at x = " + point.x.toFixed(2) + ", y = " + point.y.toFixed(2) + ".";
      } else {
        point.added = true;
        tasks.regression.note = "Added an example at x = " + point.x.toFixed(2) + ", y = " + point.y.toFixed(2) + ".";
      }
      tasks[name].added.push(point);
      recompute();
    });
  }

  function setPlaceClass(cls) {
    tasks.classification.placeClass = cls;
    document.getElementById("cls-add-a").setAttribute("aria-pressed", cls === 0 ? "true" : "false");
    document.getElementById("cls-add-b").setAttribute("aria-pressed", cls === 1 ? "true" : "false");
  }

  Object.keys(ui).forEach(function (name) {
    const spec = MLFit[name];
    const side = tasks[name];
    fillSelect(ui[name].equation, spec.equations, side.equation);
    fillSelect(ui[name].dataset, spec.datasets, side.dataset);
    ui[name].equation.addEventListener("change", function () {
      side.equation = ui[name].equation.value;
      side.note = "Click the plot to add an example.";
      recompute();
    });
    ui[name].dataset.addEventListener("change", function () {
      side.dataset = ui[name].dataset.value;
      side.added = [];
      side.note = "Click the plot to add an example.";
      recompute();
    });
    ui[name].undo.addEventListener("click", function () {
      side.added.pop();
      side.note = side.added.length ? "Removed the last example." : "Click the plot to add an example.";
      recompute();
    });
    ui[name].clear.addEventListener("click", function () {
      side.added = [];
      side.note = "Cleared your examples.";
      recompute();
    });
    bindPlot(name);
  });

  document.getElementById("cls-add-a").addEventListener("click", function () { setPlaceClass(0); });
  document.getElementById("cls-add-b").addEventListener("click", function () { setPlaceClass(1); });

  window.addEventListener("resize", recompute);
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(function () { recompute(); });
    observer.observe(ui.classification.canvas.parentElement);
    observer.observe(ui.regression.canvas.parentElement);
  }
  recompute();
})();
