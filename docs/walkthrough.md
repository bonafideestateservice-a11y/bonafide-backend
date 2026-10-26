# Push notifications: frontend walkthrough

How to get Firebase push notifications working in the client app and the admin/agent dashboard.

**API base URL:** `https://bonafide-backend-cze7.onrender.com/api/v1`

- Client app: use `/client/...`
- Admin and agent dashboard: use `/admin/...`

Every endpoint below needs the login token: `Authorization: Bearer <jwt>`.
Full request and response details are at `https://bonafide-backend-cze7.onrender.com/docs`.

---

## 1. Firebase console (one time)

Use the **same Firebase project as the backend** (ask the backend team which one).

1. **Project settings → General → Your apps → Add app → Web.** Copy the config:
   `apiKey`, `authDomain`, `projectId`, `messagingSenderId`, `appId`.
2. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair.**
   Copy the key. This is the **VAPID key**.

Put these in your env file (none of them are secret):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

(Use your framework's prefix, e.g. `NEXT_PUBLIC_` for Next.js.)

---

## 2. Install and initialize

```bash
npm install firebase
```

```ts
// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from "firebase/messaging";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const getFirebaseMessaging = async () =>
  (await isSupported()) ? getMessaging(app) : null;

export { getToken, deleteToken, onMessage };
```

---

## 3. Service worker (shows pushes when the tab is in the background)

Create **`public/firebase-messaging-sw.js`**. It must be served from the site root
(`https://your-site/firebase-messaging-sw.js`). Env variables don't work here, so paste the
config values in directly.

```js
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  messagingSenderId: "...",
  appId: "...",
});

// Displays the push's title and body automatically when the app isn't in focus.
firebase.messaging();

// Open the app's notifications page when a push is clicked.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/notifications"));
});
```

---

## 4. Turn on push after login

Run this **after the user logs in**, ideally from a button click such as "Enable notifications"
(Safari only shows the permission prompt after a click).

```ts
import { getFirebaseMessaging, getToken } from "@/lib/firebase";

export async function enablePush(apiBase: string, jwt: string) {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return; // browser doesn't support push

  if ((await Notification.requestPermission()) !== "granted") return;

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const fcmToken = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  localStorage.setItem("fcmToken", fcmToken); // needed again at logout

  await fetch(`${apiBase}/fcm-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ fcmToken }),
  });
}
```

`apiBase` is `.../api/v1/client` in the client app and `.../api/v1/admin` in the dashboard.

Call `enablePush` again on each app load while the user is logged in and permission is
`"granted"`. Firebase sometimes changes the token, and sending it again is safe.

### `POST /client/fcm-token` and `POST /admin/fcm-token`

Request:

```json
{ "fcmToken": "eXaMpLe...token-from-getToken" }
```

Responses:

| Status | Meaning |
|---|---|
| 200 | `{ "message": "FCM token saved." }` |
| 400 | `fcmToken` missing or blank |
| 401 | Not logged in / token expired |
| 403 | (`/admin` only) user isn't an admin or agent |

---

## 5. Pushes while the app is open

When the tab is in focus the browser shows nothing by itself, so show a toast and refresh the
notification list:

```ts
import { getFirebaseMessaging, onMessage } from "@/lib/firebase";

const messaging = await getFirebaseMessaging();
if (messaging) {
  onMessage(messaging, ({ notification, data }) => {
    showToast(notification?.title, notification?.body);
    refetchNotifications(); // GET /notifications
  });
}
```

### What a push contains

```json
{
  "notification": { "title": "Agent assigned", "body": "An agent has been assigned to your request." },
  "data": {
    "type": "AGENT_ASSIGNED",
    "notificationId": "f1c2...",
    "userId": "9a8b...",
    "...": "other ids for that notification, e.g. verificationRequestId"
  }
}
```

All `data` values are **strings**. `type` is one of `VERIFICATION_REQUEST_CREATED`,
`PAYMENT_RECEIVED`, `PAYMENT_FAILED`, `AGENT_ASSIGNED`, `INSPECTION_STARTED`, `REPORT_UPLOADED`,
`SUBSCRIPTION_ENDED`, `PROPERTY_REQUEST_CREATED`, `PROPERTY_REQUEST_UPDATED`,
`PROPERTY_PAYMENT_RECEIVED`, `PROPERTY_PAYMENT_FAILED`. Use `type` and the IDs to decide which page to open, and
`notificationId` to mark it read.

---

## 6. Notification list (the bell / Updates screen)

Every push is also saved, so the list works even when push is off or blocked.

| Action | Client app | Admin dashboard |
|---|---|---|
| List (newest first) | `GET /client/notifications?page=1&limit=20` | `GET /admin/notifications` |
| Only unread | add `&unreadOnly=true` | |
| Mark one read | `PATCH /client/notifications/{id}/read` | `PATCH /admin/notifications/{id}/read` |
| Mark all read | `PATCH /client/notifications/read-all` | `PATCH /admin/notifications/read-all` |

The client list response includes `unreadCount` for the bell badge. The admin list endpoints
are for admins only; agents don't have a notification list yet.

---

## 7. Push on/off setting

Use this for a "Push notifications" toggle in settings. When it's off, notifications still
appear in the list, but no push is sent to the browser.

`PATCH /client/notification-settings` or `PATCH /admin/notification-settings`

```json
{ "push": false }
```

---

## 8. Logout

Do these **in this order**:

```ts
import { getFirebaseMessaging, deleteToken } from "@/lib/firebase";

export async function logout(apiBase: string, jwt: string) {
  const fcmToken = localStorage.getItem("fcmToken");

  // 1. Tell the backend to stop pushing to this browser.
  await fetch(`${apiBase}/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify(fcmToken ? { fcmToken } : {}),
  });

  // 2. Remove the token from Firebase on this browser.
  const messaging = await getFirebaseMessaging();
  if (messaging) await deleteToken(messaging).catch(() => {});

  // 3. Clear local login state.
  localStorage.removeItem("fcmToken");
  clearStoredJwt();
  redirectToLogin();
}
```

### `POST /client/logout` and `POST /admin/logout`

Request (the body can be empty if push was never enabled):

```json
{ "fcmToken": "eXaMpLe...token-from-getToken" }
```

Response: `200 { "message": "Logged out." }`

The backend doesn't keep a record of login tokens, so it can't cancel the JWT. **The frontend
must delete the stored JWT itself** (step 3).

---

## Checklist

- [ ] Web app config and VAPID key added to env
- [ ] `public/firebase-messaging-sw.js` served at the site root
- [ ] `enablePush` called after login and on app load, then `POST /fcm-token`
- [ ] `onMessage` shows a toast and refreshes the list
- [ ] Notification list, mark read, and mark all read wired up
- [ ] Push toggle uses `PATCH /notification-settings`
- [ ] Logout calls `POST /logout`, then `deleteToken`, then clears the JWT

## Things to know

- Push only works on **HTTPS** (Vercel and Netlify are fine; on localhost it also works).
- **iPhone/iPad:** web push only works after the user adds the site to the home screen (iOS 16.4+).
- If the user blocks notifications, `getToken` fails. Skip push and rely on the notification list.
- Agents use the admin dashboard and the `/admin` endpoints.
