import { readFileSync } from 'fs';
import { resolve } from 'path';
import admin from 'firebase-admin';
import { env } from './env';

const serviceAccountJson = JSON.parse(
  readFileSync(resolve(env.firebase.serviceAccountPath), 'utf8'),
) as admin.ServiceAccount;

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountJson),
    projectId: env.firebase.projectId,
  });
}

export const firestore = admin.firestore();
export { admin };

// Server timestamp helper used when writing messages / receipts.
export const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
