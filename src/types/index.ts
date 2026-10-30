export interface ChatRow {
  id: string;
  is_group: boolean;
  title: string | null;
  created_at: Date;
}

export interface ChatMember {
  userId: string;
  displayName: string;
}

export interface ChatWithMembers {
  chatId: string;
  name: string;
  isGroup: boolean;
  title: string | null;
  createdAt: Date;
  memberIds: string[];
  members: ChatMember[];
}

export interface ReadReceipt {
  userId: string;
  displayName: string;
  readAt: string;
}

export interface MessageDto {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: string | null;
  editedAt: string | null;
  deleted: boolean;
  readBy: ReadReceipt[];
}
