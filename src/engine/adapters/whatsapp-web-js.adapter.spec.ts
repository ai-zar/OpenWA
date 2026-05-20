import { WhatsAppWebJsAdapter } from './whatsapp-web-js.adapter';
import { EngineStatus } from '../interfaces/whatsapp-engine.interface';

function makeAdapter(client: unknown): WhatsAppWebJsAdapter {
  const adapter = new WhatsAppWebJsAdapter({ sessionId: 'test', sessionDataPath: '/tmp/test' });
  // Inject a ready fake client (the real one needs a puppeteer browser).
  (adapter as unknown as { client: unknown }).client = client;
  (adapter as unknown as { status: EngineStatus }).status = EngineStatus.READY;
  return adapter;
}

describe('WhatsAppWebJsAdapter.resolveContact', () => {
  it('resolves a @lid to the real phone via the canonical @c.us id', async () => {
    const getContactById = jest.fn().mockResolvedValue({
      id: { _serialized: '380966807041@c.us' },
      name: 'Juan',
      pushname: 'Juancito',
      isMyContact: true,
      isBlocked: false,
    });
    const getProfilePicUrl = jest.fn().mockResolvedValue('https://pic');
    const adapter = makeAdapter({ getContactById, getProfilePicUrl });

    const result = await adapter.resolveContact('235106677563495@lid');

    expect(result).toEqual({
      id: '380966807041@c.us',
      phone: '380966807041',
      displayName: 'Juan',
      name: 'Juan',
      pushName: 'Juancito',
      isMyContact: true,
      isBlocked: false,
      profilePicUrl: 'https://pic',
      isLid: true,
      lid: '235106677563495@lid',
    });
  });

  it('falls back to the message notifyName when the contact has no name', async () => {
    const getContactById = jest.fn().mockResolvedValue({
      id: { _serialized: '380966807041@c.us' },
      isMyContact: false,
      isBlocked: false,
    });
    const getProfilePicUrl = jest.fn().mockResolvedValue('');
    const adapter = makeAdapter({ getContactById, getProfilePicUrl });

    const result = await adapter.resolveContact('235106677563495@lid', 'Carlos');

    expect(result?.displayName).toBe('Carlos');
    expect(result?.pushName).toBe('Carlos');
  });

  it('resolves a @c.us sender (phone = jid digits, not a LID)', async () => {
    const getContactById = jest.fn().mockResolvedValue({
      id: { _serialized: '34666663158@c.us' },
      isMyContact: false,
      isBlocked: false,
    });
    const getProfilePicUrl = jest.fn().mockResolvedValue('');
    const adapter = makeAdapter({ getContactById, getProfilePicUrl });

    const result = await adapter.resolveContact('34666663158@c.us');

    expect(result?.phone).toBe('34666663158');
    expect(result?.displayName).toBe('34666663158');
    expect(result?.isLid).toBe(false);
    expect(result?.lid).toBeUndefined();
    expect(result?.profilePicUrl).toBeUndefined();
  });

  it('returns null for a group JID without hitting the client', async () => {
    const getContactById = jest.fn();
    const adapter = makeAdapter({ getContactById });

    const result = await adapter.resolveContact('120363000000000000@g.us');

    expect(result).toBeNull();
    expect(getContactById).not.toHaveBeenCalled();
  });

  it('returns null when the lookup fails', async () => {
    const getContactById = jest.fn().mockRejectedValue(new Error('not found'));
    const adapter = makeAdapter({ getContactById });

    const result = await adapter.resolveContact('235106677563495@lid');

    expect(result).toBeNull();
  });

  it('caches a successful resolution (one lookup per contact)', async () => {
    const getContactById = jest.fn().mockResolvedValue({
      id: { _serialized: '380966807041@c.us' },
      isMyContact: false,
      isBlocked: false,
    });
    const getProfilePicUrl = jest.fn().mockResolvedValue('');
    const adapter = makeAdapter({ getContactById, getProfilePicUrl });

    await adapter.resolveContact('235106677563495@lid');
    await adapter.resolveContact('235106677563495@lid');

    expect(getContactById).toHaveBeenCalledTimes(1);
  });
});
