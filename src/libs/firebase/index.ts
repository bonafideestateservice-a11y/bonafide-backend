import admin from "firebase-admin";
import { logger } from "../../utils/logger";

let firebaseApp: admin.app.App | undefined;

export function getMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  try {
    firebaseApp ??= admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });

    return admin.messaging(firebaseApp);
  } catch (error) {
    logger.error("Firebase Admin initialization failed", { error });
    return null;
  }
}
