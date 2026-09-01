/** ابزارهای عددی مشترک با دقت کنترل‌شده */

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationError";
  }
}

/** تبدیل امن مقادیر numeric پایگاه داده (string) به عدد */
export function toNumber(
  value: unknown,
  fallback = 0,
  fieldName = "مقدار",
): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new CalculationError(`${fieldName} عددی معتبر نیست: ${String(value)}`);
  }
  return n;
}

/** گرد کردن با دقت مشخص و اجتناب از خطای ممیز شناور */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    throw new CalculationError("گرد کردن مقدار نامعتبر امکان‌پذیر نیست");
  }
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON * Math.sign(value) * Math.abs(value)) * factor) / factor;
}

/** گرد کردن مبالغ ریالی */
export function rial(value: number): number {
  return round(value, 0);
}

/** حاصل‌ضرب ضرایب با حفظ دقت تا ۱۴ رقم اعشار */
export function multiplyFactors(values: number[]): number {
  const product = values.reduce((acc, v) => {
    if (!Number.isFinite(v)) {
      throw new CalculationError(`ضریب نامعتبر: ${String(v)}`);
    }
    return acc * v;
  }, 1);
  return round(product, 14);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function safeDivide(a: number, b: number, fieldName = "مخرج"): number {
  if (b === 0) {
    throw new CalculationError(`${fieldName} نمی‌تواند صفر باشد`);
  }
  return a / b;
}

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function formatMoney(value: number, decimals = 0): string {
  const rounded = round(value, decimals);
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function toPersianDigits(input: string): string {
  return input.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
