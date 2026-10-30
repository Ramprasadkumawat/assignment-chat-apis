# Chat Backend

A small chat backend in Node.js + TypeScript.

- **PostgreSQL** stores users and chats.
- **Firebase Firestore** stores messages, read receipts and last-seen.

## Setup

1. Install packages:
   ```bash
   npm install
   ```

2. Create a `.env` (see `.env.example`):
   ```
   PORT=3000
   PGHOST=localhost
   PGPORT=5432
   PGUSER=postgres
   PGPASSWORD=postgres
   PGDATABASE=chat_demo
   FIREBASE_SERVICE_ACCOUNT_PATH=./secrets/serviceAccount.json
   FIREBASE_PROJECT_ID=your-project-id
   ```

3. Put your Firebase service-account JSON at `secrets/serviceAccount.json`
   (Firebase console → Project settings → Service accounts → Generate new private key).

4. Create the database and tables:
   ```bash
   createdb chat_demo
   npm run migrate
   ```

## Run

```bash
npm run dev      # development (auto-reload)
npm start        # after npm run build
```

Server runs at `http://localhost:3000`. Health check: `GET /health`.

## Endpoints

| Method | Path | Body |
|--------|------|------|
| POST | `/user` | `{ displayName }` |
| POST | `/chat/create` | `{ userAId, userBId }` |
| POST | `/chat/:chatId/message/send` | `{ senderId, text }` |
| GET | `/chat/:chatId/messages?limit=50` | – |
| POST | `/chat/:chatId/message/:messageId/read` | `{ userId }` |
| POST | `/chat/:chatId/lastseen` | `{ userId, messageId }` |
| GET | `/user/:userId/chats` | – |

Bonus:

| Method | Path | Body |
|--------|------|------|
| POST | `/chat/group` | `{ title, memberIds[] }` |
| POST | `/chat/:chatId/member` | `{ userId }` |
| DELETE | `/chat/:chatId/member/:userId` | – |
| PATCH | `/chat/:chatId/message/:messageId` | `{ senderId, text }` |
| DELETE | `/chat/:chatId/message/:messageId` | `{ senderId }` |

## Example responses

`GET /user/:userId/chats`

```json
{
  "chats": [
    {
      "chatId": "e1d63455-...",
      "name": "Bob",
      "isGroup": false,
      "title": null,
      "createdAt": "2026-10-30T06:03:41.099Z",
      "memberIds": ["cbf3b80e-...", "a2f29188-..."],
      "members": [
        { "userId": "cbf3b80e-...", "displayName": "Alice" },
        { "userId": "a2f29188-...", "displayName": "Bob" }
      ]
    }
  ]
}
```

`name` is the group title, or the other person's name for a 1:1 chat.

`GET /chat/:chatId/messages`

```json
{
  "messages": [
    {
      "id": "5POdNLnsaDVe3CIXbnNL",
      "senderId": "cbf3b80e-...",
      "senderName": "Alice",
      "text": "Hi Bob!",
      "createdAt": "2026-10-30T06:04:07.920Z",
      "editedAt": null,
      "deleted": false,
      "readBy": [
        { "userId": "a2f29188-...", "displayName": "Bob", "readAt": "2026-10-30T06:04:46.438Z" }
      ]
    }
  ]
}
```

Messages come back oldest first. `readBy` is empty until someone reads the message.

## Errors

Validation uses `zod`. Errors return JSON with the right status code:

- `400` – bad input (missing field, invalid UUID, empty text)
- `403` – user is not a member of the chat
- `404` – user, chat or message not found
- `409` – editing a deleted message

## Notes

- User IDs are UUIDs. `POST /user` was added because the task needs user IDs
  but had no create-user endpoint.
- Sending or reading a message requires the user to be a member of the chat.
- Deleting a message is a soft delete so ordering and read receipts stay intact.

## Testing

Import `postman_collection.json` into Postman and run the requests top to bottom.
Each request saves the IDs the next one needs.
