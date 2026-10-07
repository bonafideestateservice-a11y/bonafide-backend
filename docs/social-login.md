# Social Login (Google and Facebook)

How the frontend signs clients in with Google or Facebook using the token-exchange endpoints.

These are the only social login endpoints. The old Passport redirect endpoints (`GET /client/auth/google`, `/callback`, `/success`, `/error`, `/logout` and the Facebook equivalents) have been removed.

## The flow

The user signs in with Google or Facebook **in the frontend**, using the provider's SDK. The frontend sends the token the SDK returns to the API. The API checks the token with the provider and returns its own JWT, exactly like `/login`.

```
 Browser (your frontend)          Google / Facebook                Bonafide API
 ───────────────────────          ─────────────────                ────────────
 1. User clicks "Sign in with Google"
          │ ── SDK opens the provider's sign-in ──▶
          │                        2. User signs in / consents
          │ ◀── SDK returns a token ──
          │     Google: ID token ("credential")
          │     Facebook: access token
 3. POST /api/v1/client/auth/google/token   { idToken }
    POST /api/v1/client/auth/facebook/token { accessToken } ───────────────▶
                                                     4. API verifies the token with the
                                                        provider (it was issued for OUR app,
                                                        not expired, not forged)
                                                     5. Finds, links or creates the client
          │ ◀──────────────── 200 { token, user, isNewUser } ──────────────
 6. Store `token`, use it as `Authorization: Bearer <token>` (same as after /login)
```

The page never redirects; the provider's sign-in opens in its own popup or one-tap prompt.

## Endpoints

### `POST /api/v1/client/auth/google/token`

```json
{ "idToken": "<Google ID token>", "termsAndCondition": true }
```

### `POST /api/v1/client/auth/facebook/token`

```json
{ "accessToken": "<Facebook user access token>", "termsAndCondition": true }
```

`termsAndCondition` is optional and only stored when the sign-in creates the account. Send `true` if your sign-in screen shows "By continuing you agree to the Terms".

### Success: `200`

Same shape as `/login`, plus `isNewUser`:

```json
{
  "message": "Login successful.",
  "token": "eyJhbGciOi...",
  "user": {
    "id": "8f1c...",
    "fullName": "Ada Okafor",
    "email": "ada@example.com",
    "role": "CLIENT",
    "provider": "google",
    "profilePhoto": "https://lh3.googleusercontent.com/...",
    "termsAndCondition": true
  },
  "isNewUser": true
}
```

Use `isNewUser` to send first-time users to onboarding (phone, location, etc.).

### Errors

| Status | When                                                                   | What the frontend should do                               |
| ------ | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `400`  | Token missing, or the Facebook account didn't share an email           | Ask the user to allow email access, or sign up with email |
| `401`  | Token invalid, expired, or issued for another app                      | Restart the provider sign-in                              |
| `403`  | The email belongs to an admin or agent account                         | Tell them to use the staff login                          |
| `409`  | An account with this email exists and Google hasn't verified the email | Ask them to sign in with their password                   |

Errors use the API's usual error body (`message`).

## How accounts are matched

1. **Already signed in with this provider before:** same account, even if they've since changed their email in the app.
2. **Otherwise, an account with the same email:** it's linked, but only if the provider has verified the email, so nobody can claim an account just by its address. Password login keeps working for that account.
3. **Otherwise:** a new client account is created (no password; they can set one with "forgot password").

Admin and agent accounts can never sign in this way.

## Configuration

**Backend env:**

- `GOOGLE_CLIENT_ID` (required): ID tokens must be issued for this client ID.
- `FACEBOOK_CLIENT_ID` and `FACEBOOK_SECRET_KEY` (required): the token must belong to this Facebook app.
- `GOOGLE_ADDITIONAL_CLIENT_IDS` (optional): comma-separated extra client IDs, e.g. iOS and Android.
- `FACEBOOK_GRAPH_API_VERSION` (optional): defaults to `v21.0`.

**Frontend:** only needs the **public** IDs:

- the Google client ID (the same value as `GOOGLE_CLIENT_ID`)
- the Facebook App ID (the same value as `FACEBOOK_CLIENT_ID`)

Never put `GOOGLE_CLIENT_SECRET` or `FACEBOOK_SECRET_KEY` in the frontend.

**Provider consoles:**

- **Google Cloud Console** → APIs & Services → Credentials → your **Web** OAuth client: add each frontend origin under **Authorized JavaScript origins** (e.g. `http://localhost:5173`, `https://app.yourdomain.com`). No redirect URI is needed for this flow.
- **Meta for Developers** → your app → Facebook Login → Settings:
  - turn on **Login with the JavaScript SDK**
  - add your frontend domains to **Allowed Domains for the JavaScript SDK**
  - make sure the app can request the `email` permission

## Frontend code

### Google (Google Identity Services)

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<div id="google-signin"></div>
```

```js
const API_URL = "https://api.yourdomain.com";
const GOOGLE_CLIENT_ID = "1234-abc.apps.googleusercontent.com"; // public

window.onload = () => {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    // Called after the user picks an account; `credential` is the ID token.
    callback: async ({ credential }) => {
      try {
        const session = await exchangeToken("google", { idToken: credential });
        onSignedIn(session);
      } catch (error) {
        showError(error.message);
      }
    },
  });
  google.accounts.id.renderButton(document.getElementById("google-signin"), {
    theme: "outline",
    size: "large",
  });
};
```

### Facebook (Facebook JS SDK)

```html
<script
  async
  defer
  crossorigin="anonymous"
  src="https://connect.facebook.net/en_US/sdk.js"
></script>
<button id="facebook-signin">Continue with Facebook</button>
```

```js
const FACEBOOK_APP_ID = "123456789012345"; // public

window.fbAsyncInit = () => {
  FB.init({ appId: FACEBOOK_APP_ID, cookie: false, xfbml: false, version: "v21.0" });
};

document.getElementById("facebook-signin").addEventListener("click", () => {
  FB.login(
    (response) => {
      if (response.status !== "connected") return; // user cancelled
      exchangeToken("facebook", { accessToken: response.authResponse.accessToken })
        .then(onSignedIn)
        .catch((error) => showError(error.message));
    },
    { scope: "public_profile,email" },
  );
});
```

### Shared: exchange the token and store the session

```js
async function exchangeToken(provider, body) {
  const response = await fetch(`${API_URL}/api/v1/client/auth/${provider}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, termsAndCondition: true }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? "Sign-in failed");
  return data; // { token, user, isNewUser }
}

function onSignedIn({ token, user, isNewUser }) {
  saveToken(token); // wherever you store the /login token today
  if (isNewUser) goTo("/onboarding");
  else goTo("/dashboard");
}

// Every API call afterwards, same as with /login:
// fetch(`${API_URL}/api/v1/client/profile`, { headers: { Authorization: `Bearer ${token}` } })
```

### React

Wrap the same calls in a component; with `@react-oauth/google`, for example:

```jsx
<GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
  <GoogleLogin
    onSuccess={({ credential }) =>
      exchangeToken("google", { idToken: credential }).then(onSignedIn)
    }
    onError={() => showError("Google sign-in failed")}
  />
</GoogleOAuthProvider>
```

## Mobile apps

The same two endpoints work for mobile apps:

- **Google Sign-In SDK:** request an **ID token** and post it as `idToken`. If the iOS/Android app uses its own client ID, add it to `GOOGLE_ADDITIONAL_CLIENT_IDS`.
- **Facebook SDK:** post the user's access token as `accessToken`.

## Logging out

There's nothing to call. Delete the stored API token, as with `/login`. Optionally also call `google.accounts.id.disableAutoSelect()` and `FB.logout()` so the provider doesn't sign them straight back in.

## Backend files

| Part                  | File                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Routes and Swagger    | `src/api/client/authentication/index.ts`                                                          |
| Google endpoint       | `src/api/client/authentication/handlers/google-auth/`                                             |
| Facebook endpoint     | `src/api/client/authentication/handlers/facebook-auth/`                                           |
| Account matching      | `src/api/client/authentication/services/social-auth.ts`                                           |
| Google verification   | `src/libs/google/` (`google-auth-library`)                                                        |
| Facebook verification | `src/libs/facebook/` (Graph API `debug_token` + `/me` with `appsecret_proof`)                     |
| Tests                 | `src/tests/libs/`, `src/tests/api/client/authentication/{google-auth,facebook-auth,social-auth}/` |
