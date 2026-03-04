import type { ConstructionItem, SignalItem } from "../types";

export function placeholderConstruction(): ConstructionItem[] {
  return [
    { title: "Permits (7d)", value: "Pending source", source: "Construction API placeholder" },
    { title: "Bid Volume", value: "Pending source", source: "Construction API placeholder" },
  ];
}

export function placeholderSignals(): SignalItem[] {
  return [
    { name: "Momentum", value: "Model warm-up", direction: "flat" },
    { name: "Demand Trend", value: "Model warm-up", direction: "flat" },
  ];
}
