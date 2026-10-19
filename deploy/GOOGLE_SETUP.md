# Google setup — one-time, for the platform owner

Customers only ever see **Connect Google → sign in → done**. This is the work
behind that button: a Google Cloud project that owns the sign-in, with the
APIs switched on and Google's own approval for the Business Profile API.

Do it as **admin@nadanaloga.com** (a Google Workspace account looks better to
Google's reviewers than a Gmail address).

## 1. Create the project (5 minutes)

1. https://console.cloud.google.com → project dropdown (top left) → **New project**
   → name `PostReels` → Create → select it.
2. **APIs & Services → Library** → search and **Enable** each of these:
   - Google My Business API *(legacy v4 — reviews and posts)*
   - My Business Account Management API
   - My Business Business Information API
   - Business Profile Performance API
   - Google Search Console API
   - YouTube Data API v3
3. **APIs & Services → OAuth consent screen** (Google now calls it "Google Auth Platform → Branding"):
   - User type: **External**
   - App name: `PostReels` · Support email: admin@nadanaloga.com
   - App logo: your logo
   - App domain: `https://postreels.nadanaloga.com`
   - Privacy policy: `https://postreels.nadanaloga.com/privacy-policy.html`
   - Terms: `https://postreels.nadanaloga.com/terms-of-service.html`
   - Authorised domains: `nadanaloga.com`
   - Developer contact: admin@nadanaloga.com
   - **Scopes → Add**: `.../auth/business.manage`, `.../auth/webmasters.readonly`,
     `.../auth/youtube.upload`, `.../auth/youtube.readonly`, plus `openid`, `email`, `profile`
   - **Test users**: add your own Google accounts (the ones that manage the academy's
     Business Profile). Until the app is verified, only test users can connect.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Type: **Web application** · Name: `PostReels web`
   - Authorised JavaScript origins: `https://postreels.nadanaloga.com`
   - Authorised redirect URIs: `https://postreels.nadanaloga.com/api/connections/google/callback`
   - Create → copy the **Client ID** and **Client secret**.

## 2. Put the keys on the server (2 minutes)

Portainer → Stacks → socialboost → Environment variables:

```
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
```

→ **Update the stack**. From then on **Connect Google** works for the test
users, and the Google tab shows reviews, the visibility score and rankings.

## 3. Business Profile API access (Google's approval; days to weeks)

Reviews and posts come through the Business Profile APIs, which Google only
switches on per project after a short form:

1. https://developers.google.com/my-business/content/prereqs → **Request access**
   (the form is at https://developers.google.com/my-business/content/prereqs#request-access).
2. Answers: project number (Cloud console → Dashboard), business name
   *Nadanaloga Fine Arts Academy*, website postreels.nadanaloga.com, use case
   "a social-media and local-marketing tool for small businesses in India:
   customers connect their own Business Profile to publish updates, read and
   reply to reviews, and see insights", number of locations managed ("tens,
   growing"), and that you are **not** a reseller.
3. Google emails a decision; typically 1–2 weeks. Until then the app shows a
   friendly "pending" note on the Google tab and Search Console still works.

## 4. Consent-screen verification (so anyone can connect)

While the consent screen is unverified, Google limits sign-in to the test
users and shows a warning. To open it to all customers:

- OAuth consent screen → **Publish app** → **Prepare for verification**.
- Google asks for: the privacy policy link (ours is fine), a justification
  for each sensitive scope (use the sentences from step 3), and a short
  **YouTube video** of the sign-in and what the app does with the data
  (same idea as Meta's screencast; record Connect Google → Google tab →
  reply to a review → a post going to the listing).
- Submit. 1–4 weeks. Like Meta's review, done once.

## What the customer sees

Settings → Channels → **Connect Google** → Google's sign-in → tick the
permissions → back in the app with their Business Profile and website listed.
Then the **Google** tab: visibility score with what to fix, reviews with a
reply box, a review QR/link to share, and search rankings week over week.
