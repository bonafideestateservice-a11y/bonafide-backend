import admin from "firebase-admin";
import { logger } from "../../utils/logger";

let firebaseApp: admin.app.App | undefined;

export function getMessaging() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    firebaseApp ??= admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });

    return admin.messaging(firebaseApp);
  } catch (error) {
    logger.error("Firebase Admin initialization failed", { error });
    return null;
  }
}
