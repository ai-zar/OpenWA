import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageDirection, MessageStatus } from '../entities/message.entity';

/**
 * A WhatsApp contact resolved from a sender JID. `phone` is always the real
 * phone number, even when the message arrived from a `@lid` identifier.
 */
export class ResolvedContactDto {
  @ApiProperty({ example: '380966807041@c.us', description: 'Canonical @c.us JID' })
  id: string;

  @ApiProperty({ example: '380966807041', description: 'Real phone number (digits of id)' })
  phone: string;

  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Name as shown in WhatsApp (saved name → verified name → push name → phone)',
  })
  displayName: string;

  @ApiPropertyOptional({ example: 'Juan Pérez', description: 'Name saved in the address book' })
  name?: string;

  @ApiPropertyOptional({ example: 'Juan', description: 'Name the user set for themselves' })
  pushName?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez SA', description: 'Verified business name' })
  verifiedName?: string;

  @ApiProperty({ example: false })
  isMyContact: boolean;

  @ApiProperty({ example: false })
  isBlocked: boolean;

  @ApiPropertyOptional({ example: 'https://pps.whatsapp.net/...' })
  profilePicUrl?: string;

  @ApiProperty({ example: true, description: 'The original from/author was a @lid identifier' })
  isLid: boolean;

  @ApiPropertyOptional({ example: '235106677563495@lid', description: 'Original @lid JID, if applicable' })
  lid?: string;
}

export class MessageHistoryItemDto {
  @ApiProperty({ example: 'b3f1c0de-1234-5678-9abc-def012345678' })
  id: string;

  @ApiProperty({ example: 'c8ff756f-ce0c-49e2-aab7-97febd67b8f4' })
  sessionId: string;

  @ApiPropertyOptional({ example: 'false_235106677563495@lid_3A1ADCAA2882295F43D4' })
  waMessageId?: string;

  @ApiProperty({ example: '235106677563495@lid' })
  chatId: string;

  @ApiProperty({ example: '235106677563495@lid' })
  from: string;

  @ApiProperty({ example: '34666663158@c.us' })
  to: string;

  @ApiPropertyOptional({ example: 'AYUDA' })
  body?: string;

  @ApiProperty({ example: 'chat' })
  type: string;

  @ApiProperty({ enum: MessageDirection, example: MessageDirection.INCOMING })
  direction: MessageDirection;

  @ApiPropertyOptional({ example: 1779192534, description: 'WhatsApp timestamp (unix seconds)' })
  timestamp?: number;

  @ApiPropertyOptional({ type: ResolvedContactDto, nullable: true, description: 'Resolved sender (incoming messages)' })
  fromContact?: ResolvedContactDto | null;

  @ApiPropertyOptional({
    type: ResolvedContactDto,
    nullable: true,
    description: 'Resolved recipient (outgoing messages)',
  })
  toContact?: ResolvedContactDto | null;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Raw sender JID inside a group (msg.author)' })
  author?: string | null;

  @ApiPropertyOptional({ example: false, description: 'Whether the chat is a group' })
  isGroup?: boolean;

  @ApiProperty({ enum: MessageStatus, example: MessageStatus.SENT })
  status: MessageStatus;

  @ApiProperty({ example: '2026-05-19T12:08:55.510Z' })
  createdAt: Date;
}

export class MessageHistoryResponseDto {
  @ApiProperty({ type: [MessageHistoryItemDto] })
  messages: MessageHistoryItemDto[];

  @ApiProperty({ example: 128, description: 'Total messages matching the query' })
  total: number;
}
