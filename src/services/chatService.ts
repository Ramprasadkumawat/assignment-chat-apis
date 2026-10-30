import { pool } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import { ChatMember, ChatWithMembers } from '../types';

async function assertUsersExist(userIds: string[]): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE id = ANY($1::uuid[])',
    [userIds],
  );
  if (rows.length !== new Set(userIds).size) {
    throw new HttpError(404, 'One or more users do not exist');
  }
}

/**
 * Create a 1:1 chat between two users, or return the existing one.
 * A "1:1 chat" is a non-group chat whose members are exactly {userAId, userBId}.
 */
export async function createOrGetChat(
  userAId: string,
  userBId: string,
): Promise<string> {
  if (userAId === userBId) {
    throw new HttpError(400, 'Cannot create a 1:1 chat with the same user');
  }
  await assertUsersExist([userAId, userBId]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Look for an existing non-group chat containing exactly these two members.
    const existing = await client.query<{ id: string }>(
      `SELECT c.id
         FROM chats c
         JOIN chat_members m ON m.chat_id = c.id
        WHERE c.is_group = FALSE
        GROUP BY c.id
       HAVING COUNT(*) = 2
          AND bool_and(m.user_id = ANY($1::uuid[])) = TRUE
        LIMIT 1`,
      [[userAId, userBId]],
    );

    if (existing.rows.length > 0) {
      await client.query('COMMIT');
      return existing.rows[0].id;
    }

    const chat = await client.query<{ id: string }>(
      'INSERT INTO chats (is_group) VALUES (FALSE) RETURNING id',
    );
    const chatId = chat.rows[0].id;

    await client.query(
      `INSERT INTO chat_members (chat_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [chatId, userAId, userBId],
    );

    await client.query('COMMIT');
    return chatId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Create a group chat with a title and an initial set of members. */
export async function createGroupChat(
  title: string,
  memberIds: string[],
): Promise<string> {
  const unique = [...new Set(memberIds)];
  if (unique.length < 1) {
    throw new HttpError(400, 'A group chat needs at least one member');
  }
  await assertUsersExist(unique);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const chat = await client.query<{ id: string }>(
      'INSERT INTO chats (is_group, title) VALUES (TRUE, $1) RETURNING id',
      [title],
    );
    const chatId = chat.rows[0].id;

    const values = unique.map((_, i) => `($1, $${i + 2})`).join(', ');
    await client.query(
      `INSERT INTO chat_members (chat_id, user_id) VALUES ${values}`,
      [chatId, ...unique],
    );
    await client.query('COMMIT');
    return chatId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Add a member to a chat (group management bonus). */
export async function addMember(chatId: string, userId: string): Promise<void> {
  await getChatOrThrow(chatId);
  await assertUsersExist([userId]);
  await pool.query(
    `INSERT INTO chat_members (chat_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (chat_id, user_id) DO NOTHING`,
    [chatId, userId],
  );
}

/** Remove a member from a chat (group management bonus). */
export async function removeMember(chatId: string, userId: string): Promise<void> {
  await getChatOrThrow(chatId);
  await pool.query(
    'DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId],
  );
}

export async function getChatOrThrow(chatId: string): Promise<void> {
  const { rows } = await pool.query('SELECT 1 FROM chats WHERE id = $1', [chatId]);
  if (rows.length === 0) {
    throw new HttpError(404, 'Chat not found');
  }
}

export async function isChatMember(
  chatId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
    [chatId, userId],
  );
  return rows.length > 0;
}

/**
 * List all chats a user belongs to, including each member's id and name.
 * `name` is a friendly label: the group title for group chats, or the other
 * person's name for a 1:1 chat.
 */
export async function listUserChats(
  userId: string,
): Promise<ChatWithMembers[]> {
  const { rows } = await pool.query<{
    id: string;
    is_group: boolean;
    title: string | null;
    created_at: Date;
    members: ChatMember[];
  }>(
    `SELECT c.id,
            c.is_group,
            c.title,
            c.created_at,
            json_agg(
              json_build_object('userId', u.id, 'displayName', u.display_name)
              ORDER BY u.display_name
            ) AS members
       FROM chats c
       JOIN chat_members my_m ON my_m.chat_id = c.id AND my_m.user_id = $1
       JOIN chat_members all_m ON all_m.chat_id = c.id
       JOIN users u ON u.id = all_m.user_id
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    [userId],
  );

  return rows.map((r) => {
    const others = r.members.filter((m) => m.userId !== userId);
    const name = r.is_group
      ? r.title ?? 'Untitled group'
      : others[0]?.displayName ?? 'Unknown';

    return {
      chatId: r.id,
      name,
      isGroup: r.is_group,
      title: r.title,
      createdAt: r.created_at,
      memberIds: r.members.map((m) => m.userId),
      members: r.members,
    };
  });
}

/** Look up display names for a set of user ids (used to enrich messages). */
export async function getUserNames(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    'SELECT id, display_name FROM users WHERE id = ANY($1::uuid[])',
    [userIds],
  );
  return new Map(rows.map((r) => [r.id, r.display_name]));
}

/** Helper used by seeding / testing. */
export async function createUser(displayName: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (display_name) VALUES ($1) RETURNING id',
    [displayName],
  );
  return rows[0].id;
}
