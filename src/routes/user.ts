import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import * as chats from '../services/chatService';

export const userRouter = Router();

// Create a user (not in the original spec, but every endpoint needs user IDs).
userRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { displayName } = z
      .object({ displayName: z.string().trim().min(1).max(80) })
      .parse(req.body);

    const userId = await chats.createUser(displayName);
    res.status(201).json({ userId, displayName });
  }),
);

// 6. List a user's chats with member IDs
userRouter.get(
  '/:userId/chats',
  asyncHandler(async (req, res) => {
    const userId = z.string().uuid().parse(req.params.userId);
    const list = await chats.listUserChats(userId);
    res.json({ chats: list });
  }),
);
