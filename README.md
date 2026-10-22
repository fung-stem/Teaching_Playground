# Learning Playground

A local page where students fit an equation to data. Classification learns a category. Regression learns a number. The page chooses the numbers in the equation and shows the result.

## Tech stack

Static HTML, CSS, and JavaScript. No build step and no dependencies. It opens from disk and can be hosted later as a static site.

## Project logic

- `js/fit.js` holds the datasets and the fitting math. Classification learns a boundary (line, parabola, circle, or a degree-8 polynomial in x and y). Regression learns a curve (line, parabola, cubic, or a degree-12 polynomial) by least squares. The high-degree equations can overfit.
- `js/app.js` draws the two plots and updates the numbers when the equation, the dataset, or a clicked example changes.
- Below a classification boundary is Class A. Above it is Class B. Inside a circle is Class A. A regression curve predicts one y for each x.
- Added points are temporary. Changing the dataset clears them. Changing the equation keeps them and fits again.

## How to run

Open `index.html` in a browser, or from this folder:

```bash
python3 -m http.server 8765
```

Then visit `http://localhost:8765`.

Check the fitting math:

```bash
node js/fit.check.js
```
