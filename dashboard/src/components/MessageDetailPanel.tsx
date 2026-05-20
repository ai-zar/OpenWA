import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { Message, Session } from '../services/api';
import { useContactQuery } from '../hooks/queries';
import { getMessageTypeMeta } from '../utils/messageType';
import './MessageDetailPanel.css';

interface MessageDetailPanelProps {
  message: Message;
  session?: Session;
  onClose: () => void;
}

interface Party {
  name: string;
  sub?: string;
  avatarUrl?: string;
  isMe: boolean;
}

function MiniContact({ label, party }: { label: string; party: Party }) {
  const initial = party.name.charAt(0).toUpperCase() || '?';
  return (
    <div className="mini-contact">
      <span className="mini-contact-label">{label}</span>
      <div className="mini-contact-card">
        {party.avatarUrl ? (
          <img src={party.avatarUrl} alt="" className="mini-contact-avatar" />
        ) : (
          <div className={`mini-contact-avatar placeholder ${party.isMe ? 'me' : ''}`}>{initial}</div>
        )}
        <div className="mini-contact-text">
          <span className="mini-contact-name">{party.name}</span>
          {party.sub && <span className="mini-contact-sub">{party.sub}</span>}
        </div>
      </div>
    </div>
  );
}

export function MessageDetailPanel({ message, session, onClose }: MessageDetailPanelProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isGroup = message.chatId.endsWith('@g.us');
  const isIncoming = message.direction === 'incoming';
  const fc = message.fromContact;

  // Outgoing messages persist the resolved recipient in metadata.toContact.
  // For older rows without it, fall back to a live lookup (needs a connected session).
  const persistedToContact = message.toContact;
  const recipientQuery = useContactQuery(
    session?.id ?? '',
    message.chatId,
    !isIncoming && !isGroup && !!session && !persistedToContact,
  );

  const meParty: Party = {
    name: t('messages.detail.you'),
    sub: session?.phone || session?.name,
    isMe: true,
  };

  const counterpart: Party = (() => {
    if (isGroup) {
      return { name: t('messages.detail.group'), sub: message.chatId, isMe: false };
    }
    if (isIncoming) {
      if (fc) {
        return {
          name: fc.displayName || fc.name || fc.verifiedName || fc.pushName || fc.phone || message.from,
          sub: fc.phone,
          avatarUrl: fc.profilePicUrl,
          isMe: false,
        };
      }
      return { name: message.from, isMe: false };
    }
    if (persistedToContact) {
      return {
        name:
          persistedToContact.displayName ||
          persistedToContact.name ||
          persistedToContact.verifiedName ||
          persistedToContact.pushName ||
          persistedToContact.phone ||
          message.chatId,
        sub: persistedToContact.phone,
        avatarUrl: persistedToContact.profilePicUrl,
        isMe: false,
      };
    }
    const c = recipientQuery.data;
    if (c) {
      return {
        name: c.name || c.verifiedName || c.pushName || c.number || message.chatId,
        sub: c.number,
        avatarUrl: c.profilePicUrl,
        isMe: false,
      };
    }
    return { name: message.chatId, isMe: false };
  })();

  const fromParty = isIncoming ? counterpart : meParty;
  const toParty = isIncoming ? meParty : counterpart;

  const typeMeta = getMessageTypeMeta(message.type);
  const TypeIcon = typeMeta.Icon;

  const metaRows: { label: string; value: string; mono?: boolean }[] = [
    { label: t('messages.columns.direction'), value: t(`messages.direction.${message.direction}`) },
    { label: t('messages.columns.chatId'), value: message.chatId, mono: true },
    { label: t('messages.columns.type'), value: message.type },
    { label: t('messages.columns.status'), value: message.status },
  ];
  if (message.author) {
    metaRows.push({ label: t('messages.detail.author'), value: message.author, mono: true });
  }
  if (message.waMessageId) {
    metaRows.push({ label: t('messages.detail.waId'), value: message.waMessageId, mono: true });
  }

  return (
    <aside className="msg-panel" aria-label={t('messages.detail.title')}>
      <button className="msg-panel-toggle" onClick={onClose} aria-label={t('common.close')}>
        <ChevronRight size={16} />
      </button>

      <div className="msg-panel-body">
        <section className="msg-panel-section">
          <h4>{t('messages.detail.parties')}</h4>
          <MiniContact label={t('messages.detail.from')} party={fromParty} />
          <MiniContact label={t('messages.detail.to')} party={toParty} />
        </section>

        <section className="msg-panel-section">
          <h4>{t('messages.detail.message')}</h4>
          <div className="msg-panel-chat">
            <div className={`chat-bubble ${message.direction}`}>
              {typeMeta.isMedia && (
                <div className="chat-bubble-type">
                  <TypeIcon size={16} />
                  <span>{t(typeMeta.labelKey)}</span>
                </div>
              )}
              {message.body ? (
                <div className="chat-bubble-body">{message.body}</div>
              ) : (
                !typeMeta.isMedia && <div className="chat-bubble-body chat-bubble-empty">—</div>
              )}
              <div className="chat-bubble-time">{new Date(message.createdAt).toLocaleString()}</div>
            </div>
          </div>
        </section>

        <section className="msg-panel-section">
          <h4>{t('messages.detail.title')}</h4>
          <dl className="msg-panel-meta">
            {metaRows.map(row => (
              <div key={row.label} className="msg-panel-meta-row">
                <dt>{row.label}</dt>
                <dd className={row.mono ? 'mono' : undefined}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </aside>
  );
}
