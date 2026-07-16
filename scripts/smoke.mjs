import { spawn } from "node:child_process";

const port = 3100;
const origin = `http://127.0.0.1:${port}`;
const server = spawn("npm", ["run", "start", "--", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port) }
});

let logs = "";
server.stdout.on("data", (chunk) => { logs += chunk.toString(); });
server.stderr.on("data", (chunk) => { logs += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become ready.\n${logs}`);
}

try {
  await waitForServer();
  const home = await fetch(origin);
  const health = await fetch(`${origin}/api/health`).then((response) => response.json());
  const market = await fetch(`${origin}/api/market`).then((response) => response.json());
  const chart = await fetch(`${origin}/api/chart`).then((response) => response.json());
  const analyzeResponse = await fetch(`${origin}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "วิเคราะห์ทองตอนนี้ให้หน่อย", manualPrice: 4022 })
  });
  const analyze = await analyzeResponse.json();

  if (!home.ok || !health.ok || market.symbol !== "XAUUSD" || chart.symbol !== "XAUUSD" || chart.bars?.length < 24 || analyze.analysis?.price !== 4022) {
    throw new Error(`Smoke assertion failed: ${JSON.stringify({ home: home.status, health, market, chart, analyze })}`);
  }
  console.log(JSON.stringify({
    home: home.status,
    health,
    market: { symbol: market.symbol, source: market.source, stale: market.stale },
    chart: { symbol: chart.symbol, source: chart.source, bars: chart.bars.length },
    analyze: { status: analyzeResponse.status, source: analyze.analysis.source, action: analyze.analysis.action, manualPrice: analyze.analysis.price }
  }, null, 2));
} finally {
  server.kill("SIGTERM");
}
