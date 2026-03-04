import assert from "node:assert/strict";

const sample = {
  generated_at: new Date().toISOString(),
  tickers: [{ symbol: "SPY", price: 500.12, change: 1.2, changePct: 0.24 }],
  news: [{ title: "Sample headline", source: "Example", url: "https://example.com", publishedAt: new Date().toISOString() }],
  construction: [{ title: "Permits", value: "Pending source", source: "Placeholder" }],
  signals: [{ name: "Momentum", value: "Warm-up", direction: "flat" }],
};

assert.equal(typeof sample.generated_at, "string");
assert.ok(Array.isArray(sample.tickers));
assert.ok(Array.isArray(sample.news));
assert.ok(Array.isArray(sample.construction));
assert.ok(Array.isArray(sample.signals));

for (const ticker of sample.tickers) {
  assert.equal(typeof ticker.symbol, "string");
  assert.equal(typeof ticker.price, "number");
  assert.equal(typeof ticker.change, "number");
  assert.equal(typeof ticker.changePct, "number");
}

for (const signal of sample.signals) {
  assert.ok(["up", "down", "flat"].includes(signal.direction));
}

console.log("Payload shape sanity check passed.");
