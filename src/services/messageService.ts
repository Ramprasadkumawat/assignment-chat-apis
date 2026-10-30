import { firestore, admin, serverTimestamp } from '../config/firebase';
import { HttpError } from '../middleware/errorHandler';
import { MessageDto } from '../types';

type Timestamp = admin.firestore.Timestamp;

interface MessageDoc {
  senderId: string;
  text: string;
  createdAt: Timestamp | null;
  editedAt: Timestamp | null;
  deleted: boolean;
  readBy: Record<string, Timestamp>;
}

// Firestore-only view of a message: ids and timestamps, no user names.
// Names live in Postgres and are joined in when building the public DTO.
export interface RawMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string | null;
  editedAt: string | null;
  deleted: boolean;
  readBy: Record<string, string>;
}

function messagesRef(chatId: string): admin.firestore.CollectionReference {
  return firestore.collection('chats').doc(chatId).collection('messages');
}

function lastSeenRef(chatId: string): admin.firestore.CollectionReference {
  return firestore.collection('chats').doc(chatId).collection('lastSeen');
}

function toIso(ts: Timestamp | null | undefined): string | null {
  return ts ? ts.toDate().toISOString() : null;
}

function toRaw(id: string, data: MessageDoc): RawMessage {
  const readBy: Record<string, string> = {};
  for (const [userId, ts] of Object.entries(data.readBy ?? {})) {
    const iso = toIso(ts);
    if (iso) readBy[userId] = iso;
  }

  return {
    id,
    senderId: data.senderId,
    text: data.deleted ? '' : data.text,
    createdAt: toIso(data.createdAt),
    editedAt: toIso(data.editedAt),
    deleted: data.deleted,
    readBy,
  };
}

/** Collect every user id referenced by a set of messages (senders + readers). */
export function collectUserIds(messages: RawMessage[]): string[] {
  const ids = new Set<string>();
  for (const m of messages) {
    ids.add(m.senderId);
    for (const userId of Object.keys(m.readBy)) {
      ids.add(userId);
    }
  }
  return [...ids];
}

/** Build the public, name-enriched message from a raw message + a name lookup. */
export function toPublicMessage(
  raw: RawMessage,
  names: Map<string, string>,
): MessageDto {
  return {
    id: raw.id,
    senderId: raw.senderId,
    senderName: names.get(raw.senderId) ?? 'Unknown',
    text: raw.text,
    createdAt: raw.createdAt,
    editedAt: raw.editedAt,
    deleted: raw.deleted,
    readBy: Object.entries(raw.readBy).map(([userId, readAt]) => ({
      userId,
      displayName: names.get(userId) ?? 'Unknown',
      readAt,
    })),
  };
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  text: string,
): Promise<RawMessage> {
  const ref = messagesRef(chatId).doc();
  await ref.set({
    senderId,
    text,
    createdAt: serverTimestamp(),
    editedAt: null,
    deleted: false,
    readBy: {},
  });

  const snap = await ref.get();
  return toRaw(snap.id, snap.data() as MessageDoc);
}

/** Returns the most recent `limit` messages in chronological order (oldest first). */
export async function getMessages(
  chatId: string,
  limit: number,
): Promise<RawMessage[]> {
  const snap = await messagesRef(chatId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs
    .map((doc) => toRaw(doc.id, doc.data() as MessageDoc))
    .reverse();
}

export async function markMessageRead(
  chatId: string,
  messageId: string,
  userId: string,
): Promise<void> {
  const ref = messagesRef(chatId).doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpError(404, 'Message not found');
  }

  await ref.update({ [`readBy.${userId}`]: serverTimestamp() });
}

export async function updateLastSeen(
  chatId: string,
  userId: string,
  messageId: string,
): Promise<void> {
  const msg = await messagesRef(chatId).doc(messageId).get();
  if (!msg.exists) {
    throw new HttpError(404, 'Message not found');
  }

  await lastSeenRef(chatId).doc(userId).set(
    {
      messageId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// --- Bonus: edit / delete ---

export async function editMessage(
  chatId: string,
  messageId: string,
  senderId: string,
  text: string,
): Promise<RawMessage> {
  const ref = messagesRef(chatId).doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpError(404, 'Message not found');
  }

  const data = snap.data() as MessageDoc;
  if (data.senderId !== senderId) {
    throw new HttpError(403, 'Only the sender can edit this message');
  }
  if (data.deleted) {
    throw new HttpError(409, 'Cannot edit a deleted message');
  }

  await ref.update({ text, editedAt: serverTimestamp() });
  const updated = await ref.get();
  return toRaw(updated.id, updated.data() as MessageDoc);
}

export async function deleteMessage(
  chatId: string,
  messageId: string,
  senderId: string,
): Promise<void> {
  const ref = messagesRef(chatId).doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpError(404, 'Message not found');
  }

  const data = snap.data() as MessageDoc;
  if (data.senderId !== senderId) {
    throw new HttpError(403, 'Only the sender can delete this message');
  }

  // Soft delete so ordering/read receipts stay intact.
  await ref.update({ deleted: true, text: '' });
}
