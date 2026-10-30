import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import * as chats from '../services/chatService';
import * as messages from '../services/messageService';

export const chatRouter = Router();

const uuid = z.string().uuid();

async function ensureMember(chatId: string, userId: string): Promise<void> {
  await chats.getChatOrThrow(chatId);
  const member = await chats.isChatMember(chatId, userId);
  if (!member) {
    throw new HttpError(403, 'User is not a member of this chat');
  }
}

// 1. Create or get a 1:1 chat
chatRouter.post(
  '/create',
  asyncHandler(async (req, res) => {
    const { userAId, userBId } = z
      .object({ userAId: uuid, userBId: uuid })
      .parse(req.body);

    const chatId = await chats.createOrGetChat(userAId, userBId);
    res.status(201).json({ chatId });
  }),
);

// Bonus: create a group chat
chatRouter.post(
  '/group',
  asyncHandler(async (req, res) => {
    const { title, memberIds } = z
      .object({
        title: z.string().trim().min(1).max(120),
        memberIds: z.array(uuid).min(1),
      })
      .parse(req.body);

    const chatId = await chats.createGroupChat(title, memberIds);
    res.status(201).json({ chatId });
  }),
);

// Bonus: add a member to a chat
chatRouter.post(
  '/:chatId/member',
  asyncHandler(async (req, res) => {
    const chatId = uuid.parse(req.params.chatId);
    const { userId } = z.object({ userId: uuid }).parse(req.body);

    await chats.addMember(chatId, userId);
    res.status(204).send();
  }),
);

// Bonus: remove a member from a chat
chatRouter.delete(
  '/:chatId/member/:userId',
  asyncHandler(async (req, res) => {
    const { chatId, userId } = z
      .object({ chatId: uuid, userId: uuid })
      .parse(req.params);

    await chats.removeMember(chatId, userId);
    res.status(204).send();
  }),
);

// 2. Send a message
chatRouter.post(
  '/:chatId/message/send',
  asyncHandler(async (req, res) => {
    const chatId = uuid.parse(req.params.chatId);
    const { senderId, text } = z
      .object({ senderId: uuid, text: z.string().trim().min(1).max(4000) })
      .parse(req.body);

    await ensureMember(chatId, senderId);
    const raw = await messages.sendMessage(chatId, senderId, text);
    const names = await chats.getUserNames(messages.collectUserIds([raw]));
    res.status(201).json(messages.toPublicMessage(raw, names));
  }),
);

// 3. Get messages (ordered by timestamp)
chatRouter.get(
  '/:chatId/messages',
  asyncHandler(async (req, res) => {
    const chatId = uuid.parse(req.params.chatId);
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query);

    await chats.getChatOrThrow(chatId);
    const raw = await messages.getMessages(chatId, limit);
    const names = await chats.getUserNames(messages.collectUserIds(raw));
    res.json({ messages: raw.map((m) => messages.toPublicMessage(m, names)) });
  }),
);

// 4. Mark a message as read
chatRouter.post(
  '/:chatId/message/:messageId/read',
  asyncHandler(async (req, res) => {
    const { chatId, messageId } = z
      .object({ chatId: uuid, messageId: z.string().min(1) })
      .parse(req.params);
    const { userId } = z.object({ userId: uuid }).parse(req.body);

    await ensureMember(chatId, userId);
    await messages.markMessageRead(chatId, messageId, userId);
    res.status(204).send();
  }),
);

// 5. Update last seen message
chatRouter.post(
  '/:chatId/lastseen',
  asyncHandler(async (req, res) => {
    const chatId = uuid.parse(req.params.chatId);
    const { userId, messageId } = z
      .object({ userId: uuid, messageId: z.string().min(1) })
      .parse(req.body);

    await ensureMember(chatId, userId);
    await messages.updateLastSeen(chatId, userId, messageId);
    res.status(204).send();
  }),
);

// Bonus: edit a message
chatRouter.patch(
  '/:chatId/message/:messageId',
  asyncHandler(async (req, res) => {
    const { chatId, messageId } = z
      .object({ chatId: uuid, messageId: z.string().min(1) })
      .parse(req.params);
    const { senderId, text } = z
      .object({ senderId: uuid, text: z.string().trim().min(1).max(4000) })
      .parse(req.body);

    await ensureMember(chatId, senderId);
    const raw = await messages.editMessage(chatId, messageId, senderId, text);
    const names = await chats.getUserNames(messages.collectUserIds([raw]));
    res.json(messages.toPublicMessage(raw, names));
  }),
);

// Bonus: delete a message (soft delete)
chatRouter.delete(
  '/:chatId/message/:messageId',
  asyncHandler(async (req, res) => {
    const { chatId, messageId } = z
      .object({ chatId: uuid, messageId: z.string().min(1) })
      .parse(req.params);
    const { senderId } = z.object({ senderId: uuid }).parse(req.body);

    await ensureMember(chatId, senderId);
    await messages.deleteMessage(chatId, messageId, senderId);
    res.status(204).send();
  }),
);
