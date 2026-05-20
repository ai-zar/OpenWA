import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Search, MessageSquare, Loader2, ArrowDownLeft, ArrowUpRight, ChevronUp, ChevronDown } from 'lucide-react';
import type { Message } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSessionsQuery, useMessagesQuery } from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import { MessageDetailPanel } from '../components/MessageDetailPanel';
import { getMessageTypeMeta } from '../utils/messageType';
import './Messages.css';

const LIMIT = 20;

const TYPE_OPTIONS = [
  { value: 'chat', labelKey: 'messages.types.text' },
  { value: 'image', labelKey: 'messages.types.image' },
  { value: 'video', labelKey: 'messages.types.video' },
  { value: 'audio', labelKey: 'messages.types.audio' },
  { value: 'ptt', labelKey: 'messages.types.ptt' },
  { value: 'document', labelKey: 'messages.types.document' },
  { value: 'sticker', labelKey: 'messages.types.sticker' },
  { value: 'location', labelKey: 'messages.types.location' },
];

const STATUS_OPTIONS = ['pending', 'sent', 'delivered', 'read', 'failed'];

export function Messages() {
  const { t } = useTranslation();
  useDocumentTitle(t('messages.title'));

  const navigate = useNavigate();
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: sessions, isLoading: sessionsLoading } = useSessionsQuery();

  // URL is the source of truth: /messages/:sessionId?q=&dir=&type=&status=&sort=&order=&page=&msg=
  const sessionId =
    routeSessionId && sessions?.some(s => s.id === routeSessionId)
      ? routeSessionId
      : (sessions?.[0]?.id ?? '');
  const search = searchParams.get('q') ?? '';
  const directionFilter = searchParams.get('dir') ?? '';
  const typeFilter = searchParams.get('type') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const sortBy = searchParams.get('sort') ?? 'createdAt';
  const sortOrder = searchParams.get('order') ?? 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const selectedId = searchParams.get('msg');

  const [searchInput, setSearchInput] = useState(search);

  // Redirect a bare /messages to /messages/:firstSession so the URL is shareable.
  useEffect(() => {
    if (!routeSessionId && sessions && sessions.length > 0) {
      navigate(`/messages/${sessions[0].id}`, { replace: true });
    }
  }, [routeSessionId, sessions, navigate]);

  // Keep the input in sync when the URL changes externally (back/forward).
  useEffect(() => {
    setSearchInput(prev => (prev.trim() === search ? prev : search));
  }, [search]);

  const patchParams = (mutate: (p: URLSearchParams) => void) => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        mutate(next);
        return next;
      },
      { replace: false },
    );
  };

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const value = searchInput.trim();
    if (value === search) return; // no change (also skips the initial mount)
    const timer = setTimeout(() => {
      patchParams(p => {
        if (value) p.set('q', value);
        else p.delete('q');
        p.set('page', '1');
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search]);

  const { data, isLoading, isFetching } = useMessagesQuery(sessionId, {
    search: search || undefined,
    direction: directionFilter || undefined,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    sortBy,
    sortOrder,
    page,
    limit: LIMIT,
  });
  const messages: Message[] = data?.messages ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  const selected = selectedId ? (messages.find(m => m.id === selectedId) ?? null) : null;

  const goToPage = (n: number) => patchParams(p => p.set('page', String(n)));
  const selectMessage = (id: string) => patchParams(p => p.set('msg', id));
  const closePanel = () => patchParams(p => p.delete('msg'));

  const setFilter = (key: string, value: string) =>
    patchParams(p => {
      if (value) p.set(key, value);
      else p.delete(key);
      p.set('page', '1');
    });

  const toggleSort = (col: string) =>
    patchParams(p => {
      if (sortBy === col) {
        p.set('order', sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        p.set('sort', col);
        p.set('order', 'desc');
      }
      p.set('page', '1');
    });

  const sortHeader = (col: string, labelKey: string) => {
    const active = sortBy === col;
    return (
      <span
        className={`th-sortable ${active ? 'active' : ''}`}
        onClick={() => toggleSort(col)}
        role="button"
        tabIndex={0}
      >
        {t(labelKey)}
        {active && (sortOrder === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
      </span>
    );
  };

  const renderContact = (msg: Message) => {
    const isIncoming = msg.direction === 'incoming';
    const c = isIncoming ? msg.fromContact : msg.toContact;
    const fallback = isIncoming ? msg.from : msg.to;
    const primary = c?.displayName || c?.name || c?.verifiedName || c?.pushName || c?.phone || fallback;
    const phone = c?.phone;
    return (
      <span className="msg-sender">
        <span className="msg-sender-name">{primary}</span>
        {phone && phone !== primary && <span className="msg-sender-phone">{phone}</span>}
      </span>
    );
  };

  const renderType = (msg: Message) => {
    const meta = getMessageTypeMeta(msg.type);
    const TypeIcon = meta.Icon;
    return (
      <span className="msg-type">
        <TypeIcon size={14} />
        {t(meta.labelKey)}
      </span>
    );
  };

  if (sessionsLoading) {
    return (
      <div
        className="messages-page"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="messages-page">
        <PageHeader title={t('messages.title')} subtitle={t('messages.subtitle')} />
        <div className="empty-table-state">
          <MessageSquare size={48} strokeWidth={1} />
          <h3>{t('messages.noSessions.title')}</h3>
          <p>{t('messages.noSessions.description')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages-page">
      <PageHeader title={t('messages.title')} subtitle={t('messages.subtitle')} />

      <div className={`messages-layout ${selected ? 'with-panel' : ''}`}>
        <div className="messages-main">
          <div className="filters-bar">
            <div className="filter-group">
              <select value={sessionId} onChange={e => navigate(`/messages/${e.target.value}`)}>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.phone ? ` (${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="search-input">
              <Search size={18} />
              <input
                type="text"
                placeholder={t('messages.searchPlaceholder')}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
              {isFetching && !isLoading && <Loader2 className="animate-spin" size={16} />}
            </div>

            <div className="filter-group">
              <select value={directionFilter} onChange={e => setFilter('dir', e.target.value)}>
                <option value="">{t('messages.filters.allDirections')}</option>
                <option value="incoming">{t('messages.direction.incoming')}</option>
                <option value="outgoing">{t('messages.direction.outgoing')}</option>
              </select>
            </div>

            <div className="filter-group">
              <select value={typeFilter} onChange={e => setFilter('type', e.target.value)}>
                <option value="">{t('messages.filters.allTypes')}</option>
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <select value={statusFilter} onChange={e => setFilter('status', e.target.value)}>
                <option value="">{t('messages.filters.allStatuses')}</option>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="messages-table-container">
            <div className="messages-table">
              <div className="table-row header">
                {sortHeader('direction', 'messages.columns.direction')}
                <span>{t('messages.columns.contact')}</span>
                <span>{t('messages.columns.chatId')}</span>
                {sortHeader('type', 'messages.columns.type')}
                <span>{t('messages.columns.body')}</span>
                {sortHeader('status', 'messages.columns.status')}
                {sortHeader('createdAt', 'messages.columns.time')}
              </div>

              {isLoading ? (
                <div className="empty-table-state">
                  <Loader2 className="animate-spin" size={32} />
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-table-state">
                  <MessageSquare size={48} strokeWidth={1} />
                  <h3>{t('messages.empty.title')}</h3>
                  <p>{t('messages.empty.description')}</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`table-row clickable ${selectedId === msg.id ? 'selected' : ''}`}
                    onClick={() => selectMessage(msg.id)}
                  >
                    <span>
                      <span className={`direction-badge ${msg.direction}`}>
                        {msg.direction === 'incoming' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                        {t(`messages.direction.${msg.direction}`)}
                      </span>
                    </span>
                    {renderContact(msg)}
                    <span className="msg-chatid">{msg.chatId}</span>
                    {renderType(msg)}
                    <span className="msg-body">{msg.body || '—'}</span>
                    <span>
                      <span className={`status-badge ${msg.status}`}>{msg.status}</span>
                    </span>
                    <span className="timestamp">{new Date(msg.createdAt).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => goToPage(page - 1)}>
                {t('common.previous')}
              </button>
              <span className="page-numbers">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
                  <button key={p} className={p === page ? 'active' : ''} onClick={() => goToPage(p)}>
                    {p}
                  </button>
                ))}
              </span>
              <button disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                {t('common.next')}
              </button>
            </div>
          )}
        </div>

        {selected && (
          <MessageDetailPanel
            message={selected}
            session={sessions.find(s => s.id === sessionId)}
            onClose={closePanel}
          />
        )}
      </div>
    </div>
  );
}
