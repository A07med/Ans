export const DUPLICATE_PHONE_MESSAGE =
  "هذا الرقم مسجّل بالفعل\nإذا كنت قد سجلت من هذا الجهاز، أعد فتح رابط أُنس من نفس المتصفح.";

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof cause.message === "string"
  )
    return cause.message;
  return "";
}

export function registrationErrorMessage(cause: unknown) {
  const message = errorMessage(cause);
  if (message.includes("already_registered")) return DUPLICATE_PHONE_MESSAGE;
  if (message.includes("closed")) return "اكتمل التسجيل لهذه الفقرة";
  if (message.includes("invalid")) return "تأكد من الاسم ورقم هاتف عُماني صحيح";
  return "تعذّر التسجيل الآن. حاول مرة أخرى.";
}
