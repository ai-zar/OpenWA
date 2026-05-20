/**
 * Helpers to work with WhatsApp identifiers (JIDs).
 *
 * WhatsApp uses several JID suffixes:
 *  - `@c.us` / `@s.whatsapp.net` → individual user (prefix IS the phone number)
 *  - `@g.us`                     → group (prefix is a group id, NOT a phone)
 *  - `@lid`                      → privacy "Linked ID" (prefix is NOT the phone)
 *  - `@newsletter`               → channel
 */

const USER_SUFFIXES = ['@c.us', '@s.whatsapp.net'];

/** A `@lid` privacy identifier — its prefix is not a real phone number. */
export function isLid(jid: string): boolean {
  return typeof jid === 'string' && jid.endsWith('@lid');
}

/** A `@g.us` group identifier. */
export function isGroupJid(jid: string): boolean {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

/** A `@newsletter` channel identifier. */
export function isNewsletterJid(jid: string): boolean {
  return typeof jid === 'string' && jid.endsWith('@newsletter');
}

/** An individual user JID whose prefix is the real phone number. */
export function isUserJid(jid: string): boolean {
  return typeof jid === 'string' && USER_SUFFIXES.some(s => jid.endsWith(s));
}

/**
 * Extract the plain digits from a JID (or a raw phone number).
 *
 * For `@c.us` / `@s.whatsapp.net` this is the real phone number. For `@lid` /
 * `@g.us` it is just the identifier digits, NOT a phone number — callers must
 * resolve those via a contact lookup first.
 */
export function digitsFromJid(jid: string): string {
  if (typeof jid !== 'string') return '';
  const at = jid.indexOf('@');
  const local = at === -1 ? jid : jid.slice(0, at);
  // Drop device/agent suffix (e.g. "12345:6") and any non-digit character.
  return local.split(':')[0].replace(/\D/g, '');
}

/**
 * Normalize a plain phone number into a WhatsApp JID. If the input already
 * contains an `@` it is assumed to be a JID and returned unchanged.
 */
export function normalizeToJid(input: string, type: 'user' | 'group' = 'user'): string {
  if (typeof input !== 'string') return '';
  if (input.includes('@')) return input;
  const suffix = type === 'group' ? '@g.us' : '@c.us';
  return `${digitsFromJid(input)}${suffix}`;
}
