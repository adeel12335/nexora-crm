// Phone/WhatsApp handling.
//
// Numbers are stored in E.164 (+923001234567) because that is what the
// WhatsApp alerting integration will need verbatim. Local Pakistani input is
// accepted and converted, since that is how the team actually types numbers;
// any other country must be entered with its + prefix.

const PK_COUNTRY_CODE = '92';

/** Everything a human might type as separators. */
function strip(raw) {
  return String(raw).replace(/[\s\-().]/g, '');
}

/**
 * Returns { value, error }. `value` is E.164 on success, null on failure.
 *
 *   03001234567    -> +923001234567   (local mobile, leading 0 dropped)
 *   3001234567     -> +923001234567   (local mobile without the 0)
 *   923001234567   -> +923001234567
 *   +14155552671   -> +14155552671    (already international, passed through)
 *   +923001234567  -> +923001234567
 */
export function normalisePhone(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { value: null, error: null };
  }

  const cleaned = strip(raw);

  if (!/^\+?\d+$/.test(cleaned)) {
    return { value: null, error: 'Number can only contain digits, spaces, dashes and an optional leading +' };
  }

  // Already international.
  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1);
    if (!/^[1-9]\d{7,14}$/.test(digits)) {
      return { value: null, error: 'International number must be 8–15 digits after the country code, e.g. +923001234567' };
    }
    return { value: `+${digits}`, error: null };
  }

  // Local Pakistani mobile: 03XXXXXXXXX (11 digits).
  if (/^0\d{10}$/.test(cleaned)) {
    return { value: `+${PK_COUNTRY_CODE}${cleaned.slice(1)}`, error: null };
  }

  // Pakistani mobile typed without the leading zero: 3XXXXXXXXX (10 digits).
  if (/^3\d{9}$/.test(cleaned)) {
    return { value: `+${PK_COUNTRY_CODE}${cleaned}`, error: null };
  }

  // Country code typed without the +.
  if (cleaned.startsWith(PK_COUNTRY_CODE) && /^92\d{10}$/.test(cleaned)) {
    return { value: `+${cleaned}`, error: null };
  }

  if (/^0\d+$/.test(cleaned)) {
    return {
      value: null,
      error: 'Pakistani mobile numbers are 11 digits, e.g. 03001234567',
    };
  }

  return {
    value: null,
    error: 'Enter a Pakistani number like 03001234567, or another country with its code like +14155552671',
  };
}

/** Display helper: +923001234567 -> 0300 1234567 for Pakistani numbers. */
export function formatPhoneForDisplay(e164) {
  if (!e164) return '';
  if (e164.startsWith(`+${PK_COUNTRY_CODE}`) && e164.length === 13) {
    const local = `0${e164.slice(3)}`;
    return `${local.slice(0, 4)} ${local.slice(4)}`;
  }
  return e164;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 190 && EMAIL_RE.test(value.trim());
}
