// utils/password.ts —— 密码强度校验（与后端 utils.ValidatePasswordStrength 保持一致）
// 规则：长度 8~64；仅允许字母 / 数字 / 指定符号；大写 / 小写 / 数字 / 符号四类中至少含 3 类。
// 返回 '' 表示通过，否则返回中文错误文案（供 toast 用）。
// 注意：小程序构建链路禁用可选链(?.) / 空值合并(??)，本文件全用 ES2018 兼容写法。

/** 允许的符号集合，须与后端 passwordSymbols 完全一致 */
const PASSWORD_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?'

/**
 * 校验密码强度。通过返回 ''，不通过返回中文错误文案。
 * 逐字符判定四类（大写/小写/数字/符号），出现集合外字符直接判为不支持。
 */
export function validatePassword(pwd: string): string {
  if (pwd.length < 8) {
    return '密码至少 8 位'
  }
  if (pwd.length > 64) {
    return '密码不超过 64 位'
  }
  let hasUpper = false
  let hasLower = false
  let hasDigit = false
  let hasSymbol = false
  for (let i = 0; i < pwd.length; i++) {
    const c = pwd.charAt(i)
    if (c >= 'A' && c <= 'Z') {
      hasUpper = true
    } else if (c >= 'a' && c <= 'z') {
      hasLower = true
    } else if (c >= '0' && c <= '9') {
      hasDigit = true
    } else if (PASSWORD_SYMBOLS.indexOf(c) >= 0) {
      hasSymbol = true
    } else {
      return '密码含不支持的字符，仅允许字母 / 数字及 ' + PASSWORD_SYMBOLS
    }
  }
  let cats = 0
  if (hasUpper) {
    cats++
  }
  if (hasLower) {
    cats++
  }
  if (hasDigit) {
    cats++
  }
  if (hasSymbol) {
    cats++
  }
  if (cats < 3) {
    return '密码需含大写 / 小写 / 数字 / 符号中至少 3 类'
  }
  return ''
}
