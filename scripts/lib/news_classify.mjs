// scripts/lib/news_classify.mjs
// Rule-based classifier (stable, fast). You can upgrade later to ML.

const RULES = [
  { tag: "Labor",        re: /(union|strike|labor|wage|staffing|crew|workforce|apprentice)/i },
  { tag: "Materials",    re: /(lumber|concrete|cement|gypsum|drywall|steel|rebar|copper|insulation|polyiso|roofing|asphalt|glass|aggregate)/i },
  { tag: "Residential",  re: /(homebuilder|single[- ]family|multifamily|mortgage|housing starts|building permits|new home|existing home|builder)/i },
  { tag: "Institutional",re: /(hospital|school|university|airport|stadium|commercial|office|retail|hotel|data center|semiconductor|chip plant)/i },
  { tag: "Infrastructure",re: /(infrastructure|DOT|bridge|highway|rail|transit|water|wastewater|FAA|port|grid|transmission)/i },
  { tag: "Risk",         re: /(bankruptcy|default|liquidation|restructuring|covenant|impairment|lien|lawsuit|claim)/i },
  { tag: "Awards",       re: /(award|awarded|contract win|selected|RFP|bid|procurement)/i }
];

export function classifyHeadline(text) {
  const t = (text || "").slice(0, 500);
  const tags = [];

  for (const r of RULES) {
    if (r.re.test(t)) tags.push(r.tag);
  }

  // minimum useful tag
  if (tags.length === 0) tags.push("General");

  return tags;
}

// Very simple impact heuristic: 0..1
export function impactScore(tags, title) {
  let s = 0.35;
  const t = title || "";

  if (tags.includes("Risk")) s += 0.35;
  if (tags.includes("Labor")) s += 0.15;
  if (tags.includes("Materials")) s += 0.10;
  if (tags.includes("Awards")) s += 0.10;

  if (/(collapse|crisis|surge|plunge|record|halt|shutdown)/i.test(t)) s += 0.10;

  return Math.max(0, Math.min(1, s));
}

// pseudo-sentiment: -1..+1 (conservative; don’t overfit)
export function sentimentScore(title) {
  const t = title || "";
  const neg = /(bankruptcy|default|lawsuit|claim|delay|shortage|miss|cut|layoff|cancel)/i;
  const pos = /(award|win|growth|expand|record backlog|beats|raises guidance|acceleration)/i;

  if (neg.test(t) && !pos.test(t)) return -0.4;
  if (pos.test(t) && !neg.test(t)) return 0.25;
  if (neg.test(t) && pos.test(t)) return -0.1;
  return 0.0;
}
