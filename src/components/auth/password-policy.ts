export function passwordError(password: string) {
  if (password.length < 10) return "密碼至少需要 10 個字元。";
  if (!/[a-z]/i.test(password)) return "密碼至少需要一個英文字母。";
  if (!/\d/.test(password)) return "密碼至少需要一個數字。";
  if (!/[^a-zA-Z0-9]/.test(password)) return "密碼至少需要一個符號。";
  return null;
}

export const passwordHint = "至少 10 字元，且包含英文字母、數字與符號。";
