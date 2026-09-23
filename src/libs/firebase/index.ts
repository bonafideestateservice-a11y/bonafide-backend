import admin from "firebase-admin";
import serviceAccount from "./juyonna-web-app-458af-firebase-adminsdk-fbsvc-6e8678447e.json";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

export const messaging = admin.messaging();
