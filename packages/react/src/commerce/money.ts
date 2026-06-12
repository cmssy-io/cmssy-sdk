const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const THREE_DECIMAL = new Set([
  "BHD",
  "IQD",
  "JOD",
  "KWD",
  "LYD",
  "OMR",
  "TND",
]);

export function fractionDigits(currency: string): number {
  const code = currency.toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  return 2;
}

export function fromMinorUnits(minor: number, currency: string): number {
  return minor / 10 ** fractionDigits(currency);
}

export function formatPrice(
  minor: number,
  currency: string | null | undefined,
): string {
  if (!Number.isFinite(minor)) return "";
  const code = currency ?? "USD";
  const amount = fromMinorUnits(minor, code);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${amount.toFixed(fractionDigits(code))} ${code}`;
  }
}
