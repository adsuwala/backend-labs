const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = value => UUID_REGEX.test(value);

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const MAX_TITLE_LENGTH = 255;

const isTooLong = (value, max) => typeof value === 'string' && value.length > max;

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'qwerty',
  '123456',
  '12345678',
  '123456789',
  'abc123',
  'letmein',
  'admin'
]);

const isStrongPassword = value => {
  if (typeof value !== 'string') {
    return false;
  }
  const password = value.trim();
  if (password.length < 8) {
    return false;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return false;
  }
  return !COMMON_WEAK_PASSWORDS.has(password.toLowerCase());
};

module.exports = {
  UUID_REGEX,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_TITLE_LENGTH,
  isValidUUID,
  isTooLong,
  isStrongPassword
};
