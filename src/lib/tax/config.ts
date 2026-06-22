import type { TaxConfig } from "./types";

export const defaultTaxConfig: TaxConfig = {
  taxRate: 0.2,
  fxRates: {
    HKD: 0.90322,
    USD: 7.0288,
    CNY: 1,
  },
  capitalGainMode: "annual-netting",
};
