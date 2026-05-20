import { isLid, isGroupJid, isNewsletterJid, isUserJid, digitsFromJid, normalizeToJid } from './jid.util';

describe('jid.util', () => {
  describe('isLid', () => {
    it('detects @lid identifiers', () => {
      expect(isLid('235106677563495@lid')).toBe(true);
      expect(isLid('380966807041@c.us')).toBe(false);
      expect(isLid('120363000000000000@g.us')).toBe(false);
    });
  });

  describe('isGroupJid', () => {
    it('detects @g.us identifiers', () => {
      expect(isGroupJid('120363000000000000@g.us')).toBe(true);
      expect(isGroupJid('380966807041@c.us')).toBe(false);
    });
  });

  describe('isNewsletterJid', () => {
    it('detects @newsletter identifiers', () => {
      expect(isNewsletterJid('123@newsletter')).toBe(true);
      expect(isNewsletterJid('380966807041@c.us')).toBe(false);
    });
  });

  describe('isUserJid', () => {
    it('detects individual user JIDs', () => {
      expect(isUserJid('380966807041@c.us')).toBe(true);
      expect(isUserJid('380966807041@s.whatsapp.net')).toBe(true);
      expect(isUserJid('235106677563495@lid')).toBe(false);
      expect(isUserJid('120363000000000000@g.us')).toBe(false);
    });
  });

  describe('digitsFromJid', () => {
    it('extracts digits from a user JID', () => {
      expect(digitsFromJid('380966807041@c.us')).toBe('380966807041');
      expect(digitsFromJid('380966807041@s.whatsapp.net')).toBe('380966807041');
    });

    it('extracts digits from a LID', () => {
      expect(digitsFromJid('235106677563495@lid')).toBe('235106677563495');
    });

    it('strips device/agent suffixes', () => {
      expect(digitsFromJid('380966807041:12@c.us')).toBe('380966807041');
    });

    it('handles a raw phone number without @', () => {
      expect(digitsFromJid('+34 666 663 158')).toBe('34666663158');
    });

    it('returns empty string for non-string input', () => {
      expect(digitsFromJid(undefined as unknown as string)).toBe('');
    });
  });

  describe('normalizeToJid', () => {
    it('appends @c.us to a plain phone number', () => {
      expect(normalizeToJid('34666663158')).toBe('34666663158@c.us');
      expect(normalizeToJid('+34 666 663 158')).toBe('34666663158@c.us');
    });

    it('appends @g.us when type is group', () => {
      expect(normalizeToJid('120363000000000000', 'group')).toBe('120363000000000000@g.us');
    });

    it('returns the input unchanged when it already is a JID', () => {
      expect(normalizeToJid('380966807041@c.us')).toBe('380966807041@c.us');
      expect(normalizeToJid('235106677563495@lid')).toBe('235106677563495@lid');
    });
  });
});
