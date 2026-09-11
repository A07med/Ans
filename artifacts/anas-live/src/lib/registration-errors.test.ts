import { describe, expect, it } from "vitest";
import {
  DUPLICATE_PHONE_MESSAGE,
  registrationErrorMessage,
} from "./registration-errors";

describe("registration error copy", () => {
  it("shows the safe duplicate-phone guidance without recovery material", () => {
    expect(registrationErrorMessage(new Error("already_registered"))).toBe(
      "هذا الرقم مسجّل بالفعل\nإذا كنت قد سجلت من هذا الجهاز، أعد فتح رابط أُنس من نفس المتصفح.",
    );
    expect(DUPLICATE_PHONE_MESSAGE).not.toContain("رمز");
  });

  it("maps closed and invalid registration errors", () => {
    expect(registrationErrorMessage({ message: "registration_closed" })).toBe(
      "اكتمل التسجيل لهذه الفقرة",
    );
    expect(registrationErrorMessage(new Error("invalid_registration"))).toBe(
      "تأكد من الاسم ورقم هاتف عُماني صحيح",
    );
  });

  it("keeps infrastructure failures generic", () => {
    expect(registrationErrorMessage({ message: "database unavailable" })).toBe(
      "تعذّر التسجيل الآن. حاول مرة أخرى.",
    );
  });
});
