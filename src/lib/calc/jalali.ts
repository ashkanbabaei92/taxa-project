/**
 * موتور تاریخ شمسی (هجری خورشیدی) برای محاسبات انترپوله زمانی تعدیل.
 * تمام محاسبات بر پایه شماره روز مطلق (Julian Day Number) انجام می‌شود تا
 * اختلاف روزها بین سال‌های کبیسه و عادی دقیق باشد.
 */

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

export class DateFormatError extends Error {
  constructor(value: string) {
    super(`فرمت تاریخ شمسی نامعتبر است: «${value}» (قالب صحیح: YYYY/MM/DD)`);
    this.name = "DateFormatError";
  }
}

// تقسیم و باقیمانده با کوتاه‌سازی به سمت صفر (مطابق الگوریتم مرجع Borkowski)
const div = (a: number, b: number): number => Math.trunc(a / b);
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b;

/**
 * الگوریتم رسمی تقویم هجری شمسی (Borkowski) با نقاط شکست ۳۳ ساله.
 * این الگوریتم با تقویم رسمی ایران منطبق است (برخلاف تقریب چرخه ۲۸۲۰ ساله).
 */
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
  2192, 2262, 2324, 2394, 2456, 3178,
];

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new DateFormatError(`سال شمسی خارج از محدوده: ${jy}`);
  }
  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

/** تبدیل تاریخ میلادی به شماره روز مطلق */
function gregorianToDayNumber(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** تبدیل تاریخ شمسی به شماره روز مطلق */
export function jalaliToDayNumber(d: JalaliDate): number {
  const { year, month, day } = d;
  if (month < 1 || month > 12) {
    throw new DateFormatError(`${year}/${month}/${day}`);
  }
  const r = jalCal(year);
  return (
    gregorianToDayNumber(r.gy, 3, r.march) +
    (month - 1) * 31 -
    div(month, 7) * (month - 7) +
    day -
    1
  );
}

/** آیا سال شمسی کبیسه است */
export function isJalaliLeapYear(year: number): boolean {
  return jalCal(year).leap === 0;
}

export function jalaliMonthLength(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeapYear(year) ? 30 : 29;
}

/** تجزیه رشته تاریخ شمسی به شکل YYYY/MM/DD یا YYYY-MM-DD */
export function parseJalali(value: string): JalaliDate {
  if (typeof value !== "string") throw new DateFormatError(String(value));
  const parts = value.trim().replace(/-/g, "/").split("/");
  if (parts.length !== 3) throw new DateFormatError(value);
  const [year, month, day] = parts.map((p) => Number(p));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1200 ||
    year > 1600 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > jalaliMonthLength(year, month)
  ) {
    throw new DateFormatError(value);
  }
  return { year, month, day };
}

export function formatJalali(d: JalaliDate): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}/${mm}/${dd}`;
}

/** اختلاف روز بین دو تاریخ شمسی (b - a) */
export function daysBetween(a: string, b: string): number {
  return jalaliToDayNumber(parseJalali(b)) - jalaliToDayNumber(parseJalali(a));
}

export function compareJalali(a: string, b: string): number {
  const da = jalaliToDayNumber(parseJalali(a));
  const dbn = jalaliToDayNumber(parseJalali(b));
  return da === dbn ? 0 : da < dbn ? -1 : 1;
}

export function minJalali(a: string, b: string): string {
  return compareJalali(a, b) <= 0 ? a : b;
}

export function maxJalali(a: string, b: string): string {
  return compareJalali(a, b) >= 0 ? a : b;
}

export function addDays(value: string, days: number): string {
  const d = parseJalali(value);
  let y = d.year;
  let m = d.month;
  let day = d.day + days;
  while (day > jalaliMonthLength(y, m)) {
    day -= jalaliMonthLength(y, m);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  while (day < 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    day += jalaliMonthLength(y, m);
  }
  return formatJalali({ year: y, month: m, day });
}

export interface Quarter {
  year: number;
  quarter: number; // 1..4
  start: string;
  end: string;
}

export function quarterOf(value: string): { year: number; quarter: number } {
  const d = parseJalali(value);
  return { year: d.year, quarter: Math.ceil(d.month / 3) };
}

export function quarterBounds(year: number, quarter: number): Quarter {
  if (quarter < 1 || quarter > 4) {
    throw new RangeError(`شماره سه‌ماهه نامعتبر است: ${quarter}`);
  }
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return {
    year,
    quarter,
    start: formatJalali({ year, month: startMonth, day: 1 }),
    end: formatJalali({
      year,
      month: endMonth,
      day: jalaliMonthLength(year, endMonth),
    }),
  };
}

export function nextQuarter(year: number, quarter: number): {
  year: number;
  quarter: number;
} {
  return quarter === 4
    ? { year: year + 1, quarter: 1 }
    : { year, quarter: quarter + 1 };
}

export function quarterKey(year: number, quarter: number): string {
  return `${year}-Q${quarter}`;
}

/** فهرست سه‌ماهه‌های بین دو تاریخ به همراه تعداد روزهای کارکرد در هر سه‌ماهه */
export interface QuarterSpan extends Quarter {
  /** تاریخ شروع بازه داخل سه‌ماهه */
  spanStart: string;
  spanEnd: string;
  days: number;
}

export function splitPeriodIntoQuarters(
  fromDate: string,
  toDate: string,
): QuarterSpan[] {
  if (compareJalali(fromDate, toDate) > 0) {
    throw new RangeError(
      `تاریخ شروع (${fromDate}) نمی‌تواند بزرگ‌تر از تاریخ پایان (${toDate}) باشد`,
    );
  }
  const spans: QuarterSpan[] = [];
  let cursor = quarterOf(fromDate);
  const last = quarterOf(toDate);
  // حداکثر ۲۰۰ سه‌ماهه (۵۰ سال) برای جلوگیری از حلقه بی‌نهایت
  for (let guard = 0; guard < 200; guard += 1) {
    const q = quarterBounds(cursor.year, cursor.quarter);
    const spanStart = maxJalali(q.start, fromDate);
    const spanEnd = minJalali(q.end, toDate);
    // تعداد روزهای کارکرد شامل هر دو سر بازه است
    const days = daysBetween(spanStart, spanEnd) + 1;
    spans.push({ ...q, spanStart, spanEnd, days: Math.max(days, 0) });
    if (cursor.year === last.year && cursor.quarter === last.quarter) break;
    cursor = nextQuarter(cursor.year, cursor.quarter);
  }
  return spans;
}
