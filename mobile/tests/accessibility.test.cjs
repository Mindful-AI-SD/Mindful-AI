const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function helpers(os) {
  const effects = [], frames = new Map(), focusEvents = [], announcements = [];
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/components/accessibility.tsx"), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    requestAnimationFrame(fn) { frames.set(1, fn); return 1; },
    cancelAnimationFrame(id) { frames.delete(id); },
    require(name) {
      return {
        react: { useEffect: fn => effects.push(fn), useRef: value => ({ current: value }) },
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "react-native": { Platform: { OS: os }, View: "View", AccessibilityInfo: {
          sendAccessibilityEvent: (...args) => focusEvents.push(args),
          announceForAccessibility: value => announcements.push(value),
        } },
        "./themed-text": { ThemedText: "Text" },
      }[name];
    },
  });
  return { ...exports, effects, frames, focusEvents, announcements };
}

test("new native screen headings receive screen-reader focus after layout", () => {
  const api = helpers("android");
  const heading = api.AccessibleHeading({ children: "Mock intentions" });
  const target = {};
  heading.props.ref.current = target;
  const cleanup = api.effects[0]();
  assert.equal(api.focusEvents.length, 0);
  api.frames.get(1)();
  assert.equal(api.focusEvents[0][0], target);
  assert.equal(api.focusEvents[0][1], "focus");
  assert.equal(heading.props.accessibilityRole, "header");
  cleanup();
  assert.equal(api.frames.size, 0);
});

test("web headings take programmatic focus without adding a tab stop", () => {
  const api = helpers("web");
  let focused = false;
  const heading = api.AccessibleHeading({ children: "AI gap reflection" });
  heading.props.ref.current = { focus() { focused = true; } };
  api.effects[0]();
  api.frames.get(1)();
  assert.equal(focused, true);
  assert.equal(heading.props.tabIndex, -1);
});

test("error messages have readable live text and iOS announcements", () => {
  const api = helpers("ios");
  const error = api.AccessibleStatus({ children: "Could not save. Use Retry save.", error: true });
  api.effects[0]();
  assert.equal(error.props.accessibilityRole, "alert");
  assert.equal(error.props.accessibilityLiveRegion, "assertive");
  assert.deepEqual(api.announcements, ["Could not save. Use Retry save."]);
});
