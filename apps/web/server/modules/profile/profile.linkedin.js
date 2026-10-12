// apps/api/src/modules/profile/profile.linkedin.js
// LinkedIn URL validator. Only https:// URLs whose hostname is exactly
// linkedin.com or a subdomain (*.linkedin.com) and path starts with /in/.

const MAX_URL_LENGTH = 2048;

/**
 * Validate a LinkedIn profile URL.
 * Returns { valid: boolean, normalized: string|null, reason: string|null }
 */
function validateLinkedInUrl(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: true, normalized: '', reason: null }; // empty is allowed
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return { valid: true, normalized: '', reason: null };
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    return { valid: false, normalized: null, reason: 'URL too long' };
  }

  // Must start with https://
  if (!/^https:\/\//i.test(trimmed)) {
    return { valid: false, normalized: null, reason: 'LinkedIn URL must use https://' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, normalized: null, reason: 'Invalid URL format' };
  }

  // Reject dangerous protocols (URL parser should catch these, but belt-and-suspenders)
  if (parsed.protocol !== 'https:') {
    return { valid: false, normalized: null, reason: 'LinkedIn URL must use https://' };
  }

  // Reject URLs with credentials (user:pass@)
  if (parsed.username || parsed.password) {
    return { valid: false, normalized: null, reason: 'URL must not contain credentials' };
  }

  // Hostname must be exactly linkedin.com or end with .linkedin.com
  const host = parsed.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) {
    return { valid: false, normalized: null, reason: 'URL must be a linkedin.com domain' };
  }

  // Guard against look-alike attacks: hostname must only contain alphanumeric, dots, hyphens
  if (!/^[a-z0-9.-]+$/.test(host)) {
    return { valid: false, normalized: null, reason: 'Invalid hostname characters' };
  }

  // Path must start with /in/ and have a non-empty profile identifier
  const slug = parsed.pathname.replace(/^\/in\/?/, '').replace(/\/+$/, '');
  if (!parsed.pathname.startsWith('/in/') || !slug) {
    return { valid: false, normalized: null, reason: 'LinkedIn URL must be a /in/ profile link' };
  }

  // Normalize: strip tracking parameters and fragments
  const normalized = `https://${host}${parsed.pathname}`.replace(/\/+$/, '');

  return { valid: true, normalized, reason: null };
}

module.exports = { validateLinkedInUrl };
