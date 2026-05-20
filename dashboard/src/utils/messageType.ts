import { Image, Video, Mic, FileText, Sticker, MapPin, User, MessageSquare, type LucideIcon } from 'lucide-react';

export interface MessageTypeMeta {
  Icon: LucideIcon;
  /** i18n key under `messages.types.*` */
  labelKey: string;
  /** True for non-text message types (media, location, contact card...). */
  isMedia: boolean;
}

/**
 * Map a WhatsApp message `type` to a display icon + label. Used to render
 * non-text messages by type (level A: icon + label, no media payload).
 */
export function getMessageTypeMeta(type: string): MessageTypeMeta {
  switch (type) {
    case 'image':
      return { Icon: Image, labelKey: 'messages.types.image', isMedia: true };
    case 'video':
      return { Icon: Video, labelKey: 'messages.types.video', isMedia: true };
    case 'audio':
    case 'ptt':
      return { Icon: Mic, labelKey: 'messages.types.audio', isMedia: true };
    case 'document':
      return { Icon: FileText, labelKey: 'messages.types.document', isMedia: true };
    case 'sticker':
      return { Icon: Sticker, labelKey: 'messages.types.sticker', isMedia: true };
    case 'location':
      return { Icon: MapPin, labelKey: 'messages.types.location', isMedia: true };
    case 'vcard':
    case 'multi_vcard':
      return { Icon: User, labelKey: 'messages.types.contact', isMedia: true };
    default:
      return { Icon: MessageSquare, labelKey: 'messages.types.text', isMedia: false };
  }
}
