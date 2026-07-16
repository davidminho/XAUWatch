const palette = {
  paper: [0.13, 0.012, 72],
  paper2: [0.17, 0.014, 72],
  paper3: [0.21, 0.016, 72],
  ink: [0.95, 0.012, 82],
  ink2: [0.82, 0.016, 80],
  muted: [0.72, 0.018, 78],
  accent: [0.80, 0.145, 82],
  accentInk: [0.15, 0.018, 78],
  focus: [0.88, 0.13, 92],
  buy: [0.80, 0.16, 145],
  buySurface: [0.21, 0.045, 145],
  sell: [0.73, 0.17, 30],
  sellSurface: [0.21, 0.045, 30],
  wait: [0.82, 0.09, 82],
  waitSurface: [0.21, 0.035, 82]
};

function luminance([L, C, hue]) {
  const h = hue * Math.PI / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const r = Math.max(0, Math.min(1, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
  const g = Math.max(0, Math.min(1, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
  const blue = Math.max(0, Math.min(1, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
  return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
}

function ratio(foreground, background) {
  const a = luminance(palette[foreground]);
  const b = luminance(palette[background]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const pairs = [
  ["ink", "paper"], ["ink", "paper2"], ["ink2", "paper2"],
  ["muted", "paper"], ["muted", "paper2"], ["muted", "paper3"],
  ["accentInk", "accent"], ["focus", "paper"], ["focus", "paper2"],
  ["buy", "buySurface"], ["sell", "sellSurface"], ["wait", "waitSurface"]
];

let failed = false;
for (const [foreground, background] of pairs) {
  const value = ratio(foreground, background);
  const passes = value >= 4.5;
  failed ||= !passes;
  console.log(`${foreground}/${background}: ${value.toFixed(2)} ${passes ? "PASS" : "FAIL"}`);
}
if (failed) process.exitCode = 1;
