export interface AuthFormValues {
  account: string;
  password: string;
  nickname?: string;
}

export interface AuthFormErrors {
  account?: string;
  password?: string;
  nickname?: string;
}

export interface PasswordChangeValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface PasswordChangeErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function normalizeAccount(account: string): string {
  return account.trim().toLowerCase();
}

export function validateLogin(values: AuthFormValues): AuthFormErrors {
  const account = normalizeAccount(values.account);
  const errors: AuthFormErrors = {};

  if (!hasAtMostCodePoints(account, 50)) {
    errors.account = "账号不能超过 50 个字符";
  } else if (!account) {
    errors.account = "请输入账号";
  }

  const passwordBytes = utf8ByteLength(values.password);
  if (passwordBytes === 0) {
    errors.password = "请输入密码";
  } else if (passwordBytes > 72) {
    errors.password = "密码不能超过 72 字节";
  }

  return errors;
}

export function validateRegistration(values: AuthFormValues): AuthFormErrors {
  const errors = validateLogin(values);
  const passwordBytes = utf8ByteLength(values.password);
  const nickname = values.nickname?.trim() ?? "";

  if (passwordBytes > 0 && passwordBytes < 8) {
    errors.password = "密码至少需要 8 个 UTF-8 字节";
  }
  if (!nickname) {
    errors.nickname = "请输入昵称";
  } else if (!hasAtMostCodePoints(nickname, 50)) {
    errors.nickname = "昵称不能超过 50 个字符";
  }

  return errors;
}

export function validatePasswordChange(
  values: PasswordChangeValues,
): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  const currentBytes = utf8ByteLength(values.currentPassword);
  const newBytes = utf8ByteLength(values.newPassword);

  if (currentBytes === 0) {
    errors.currentPassword = "请输入当前密码";
  } else if (currentBytes > 72) {
    errors.currentPassword = "当前密码不能超过 72 字节";
  }

  if (newBytes < 8) {
    errors.newPassword = "新密码至少需要 8 个 UTF-8 字节";
  } else if (newBytes > 72) {
    errors.newPassword = "新密码不能超过 72 字节";
  } else if (values.newPassword === values.currentPassword) {
    errors.newPassword = "新密码必须与当前密码不同";
  }

  if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = "两次输入的新密码不一致";
  }

  return errors;
}

function hasAtMostCodePoints(value: string, maximum: number): boolean {
  return Array.from(value).length <= maximum;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
}
