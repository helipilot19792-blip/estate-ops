export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RECOMMENDED_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_REQUIREMENTS =
  `Use at least ${PASSWORD_MIN_LENGTH} characters. ${PASSWORD_RECOMMENDED_LENGTH}+ characters is recommended.`;

export function validatePassword(password: string) {
  if (!password) {
    return "Please enter a password.";
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  return "";
}
