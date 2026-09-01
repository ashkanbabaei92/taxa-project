import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  isJalaliLeapYear,
  parseJalali,
  quarterBounds,
  quarterOf,
  splitPeriodIntoQuarters,
  DateFormatError,
} from "@/lib/calc/jalali";

describe("تقویم شمسی", () => {
  it("طول شش ماه اول سال ۳۱ روز است", () => {
    expect(daysBetween("1403/01/01", "1403/07/01")).toBe(186); // 6*31
  });

  it("سال ۱۴۰۳ کبیسه است و اسفند ۳۰ روز دارد", () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(daysBetween("1403/12/01", "1404/01/01")).toBe(30);
  });

  it("سال ۱۴۰۴ کبیسه نیست", () => {
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(daysBetween("1404/12/01", "1405/01/01")).toBe(29);
  });

  it("افزودن روز از مرز ماه و سال عبور می‌کند", () => {
    expect(addDays("1403/06/31", 1)).toBe("1403/07/01");
    expect(addDays("1403/12/30", 1)).toBe("1404/01/01");
    expect(addDays("1404/01/01", -1)).toBe("1403/12/30");
  });

  it("تاریخ نامعتبر خطا می‌دهد", () => {
    expect(() => parseJalali("1403/13/01")).toThrow(DateFormatError);
    expect(() => parseJalali("1404/12/30")).toThrow(DateFormatError);
  });

  it("سه‌ماهه تاریخ درست تشخیص داده می‌شود", () => {
    expect(quarterOf("1403/05/20")).toEqual({ year: 1403, quarter: 2 });
    expect(quarterBounds(1403, 4)).toMatchObject({
      start: "1403/10/01",
      end: "1403/12/30",
    });
  });

  it("تفکیک بازه کارکرد بین سه‌ماهه‌ها با تعداد روز صحیح", () => {
    const spans = splitPeriodIntoQuarters("1403/02/15", "1403/07/10");
    expect(spans.map((s) => `${s.year}-Q${s.quarter}`)).toHaveLength(3);
    // Q1: 15 اردیبهشت تا 31 خرداد = 17 + 31 = 48 روز
    expect(spans[0].days).toBe(48);
    // Q2: تیر+مرداد+شهریور = 93 روز
    expect(spans[1].days).toBe(93);
    // Q3: 1 تا 10 مهر = 10 روز
    expect(spans[2].days).toBe(10);
    expect(spans.reduce((a, s) => a + s.days, 0)).toBe(
      daysBetween("1403/02/15", "1403/07/10") + 1,
    );
  });
});
