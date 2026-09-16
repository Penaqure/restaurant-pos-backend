// Applied wherever a password is set for a login-capable account (staff,
// vendor owner, super_admin) -- keeps accounts off the "1234"/"password"
// end of the spectrum without imposing a full complexity ruleset.
const MIN_LENGTH = 8;

function isStrongPassword(password) {
  if (typeof password !== "string" || password.length < MIN_LENGTH) return false;
  return /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

const PASSWORD_POLICY_MESSAGE = `Password must be at least ${MIN_LENGTH} characters and include both a letter and a number.`;

module.exports = { isStrongPassword, PASSWORD_POLICY_MESSAGE };
