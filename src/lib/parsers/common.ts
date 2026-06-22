import type { Currency } from "@/lib/tax/types";

export class ParserValidationError extends Error {
  constructor(
    message: string,
    public readonly source?: string,
  ) {
    super(message);
    this.name = "ParserValidationError";
  }
}

export function asCurrency(value: unknown): Currency {
  const text = String(value ?? "").toUpperCase();
  if (text.includes("USD") || text.includes("美元")) return "USD";
  if (text.includes("CNY") || text.includes("人民币")) return "CNY";
  return "HKD";
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[()]/g, "")
    .trim();
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeSymbol(value: unknown) {
  const text = String(value ?? "").trim().toUpperCase();
  return /^\d+$/.test(text) ? text.padStart(5, "0") : text;
}

export function sourceId(fileName: string, row: number) {
  return `${fileName}#row-${row}`;
}
