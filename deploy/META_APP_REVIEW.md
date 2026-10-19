# Meta App Review — submission package

Everything to paste into the Meta App Dashboard for the **SocialMedia** app
(App ID in `.env.production` as `META_APP_ID`). Do the steps in order; each
one is a form in the dashboard, and the text to paste is given verbatim.

Replace `https://social-media-new-omega.vercel.app` with the brand domain
everywhere once it exists — the review is tied to the URLs you submit.

---

## 0. Before you submit (checklist)

| Item | Where | Status |
|---|---|---|
| Business Verification | business.facebook.com → Security Centre | **check: must say Verified** |
| Privacy Policy URL | App settings → Basic | `https://social-media-new-omega.vercel.app/privacy-policy.html` |
| Terms of Service URL | App settings → Basic | `https://social-media-new-omega.vercel.app/terms-of-service.html` |
| User data deletion | App settings → Basic → "Data deletion instructions URL" | `https://social-media-new-omega.vercel.app/data-deletion.html` |
| Deauthorize callback | Facebook Login for Business → Settings | `https://social-media-new-omega.vercel.app/api/webhooks/meta/deauthorize` |
| App icon (1024×1024) | App settings → Basic | upload `web/public/icon-512.png` scaled up, or your logo |
| Category | App settings → Basic | **Business and pages** |
| App domains | App settings → Basic | `social-media-new-omega.vercel.app` |
| Website → Site URL | App settings → Basic → Add platform → Website | `https://social-media-new-omega.vercel.app/` |
| Valid OAuth redirect URIs | Facebook Login for Business → Settings | `https://social-media-new-omega.vercel.app/` and `https://social-media-new-omega.vercel.app/app` |
| Allowed domains for the JS SDK | Facebook Login for Business → Settings | `https://social-media-new-omega.vercel.app` |
| Login config "Nadanaloga" (ID 615765401252483) | Facebook Login for Business → Configurations | must include every permission below |
| Instagram use case | Use cases → Add "Manage everything on your Page" / Instagram | needed for the `instagram_*` permissions |

## 1. Test credentials for reviewers

Reviewers must be able to log in to **our app** and to a **Facebook account that admins a Page with a linked Instagram business account**.

**Our app (already created on the live site):**

```
URL:      https://social-media-new-omega.vercel.app/login
Email:    meta-reviewer@nadanaloga.com
Password: Reviewer-cc60627bdb82
```

**Facebook test user:** App Dashboard → App roles → **Test users** → Create → give it a Page:
log in as the test user (the dashboard offers "Log in as this user"), create a Page
"SocialBoost Review Page", convert a test Instagram account to Business and link it
to that Page (Page settings → Instagram). Note its email/password — Meta generates
them — and paste both into the review form's "Test user" field.

## 2. Permissions to request, and the text for each

App Dashboard → **App Review → Permissions and Features** → for each row click
**Request Advanced Access**, then in the review submission paste the matching
text and attach the screencast named.

### `pages_show_list`
**How we use it:** After a business signs in with Facebook, we list the Pages they administer so they can choose which Page to connect to SocialBoost. The list is shown once in a picker; only the Pages they select are stored.
**Screencast:** `connect.mp4`

### `pages_read_engagement`
**How we use it:** To show the business the performance of the posts they published through SocialBoost — likes, comments and shares per post — on the Analytics screen and in the PDF report they send to their clients. We read engagement only for posts created by our app.
**Screencast:** `analytics.mp4`

### `pages_manage_posts`
**How we use it:** To publish photo and video posts to the business's own Page at the time they choose (immediately or scheduled), with the caption they wrote. Publishing only happens when the user presses Publish or when a post they scheduled becomes due. Users can delete a post from our dashboard afterwards.
**Screencast:** `publish.mp4`

### `pages_manage_metadata` *(only if you add webhooks later; otherwise skip)*

### `read_insights`
**How we use it:** To show the Page's follower count and reach on the Analytics screen, so a business can see whether its posting is growing its audience.
**Screencast:** `analytics.mp4`

### `business_management`
**How we use it:** Pages owned by a Business Portfolio are only listed through the business endpoints. We use this to show those Pages in the connect picker for businesses that manage their Page through Meta Business Suite. Nothing is changed in the business; it is read-only listing.
**Screencast:** `connect.mp4`

### `instagram_basic`
**How we use it:** To find the Instagram business account linked to the connected Page and show its username and profile picture in the connect picker and on the Channels screen, so the user knows which account their reels will go to.
**Screencast:** `connect.mp4`

### `instagram_content_publish`
**How we use it:** To publish the images and reels the business created in SocialBoost to their own Instagram business account, when they press Publish or at the scheduled time. Media is hosted at a public URL we provide to the container endpoint; the caption is the user's own.
**Screencast:** `publish.mp4`

### `instagram_manage_insights`
**How we use it:** To show likes, comments and reach of the reels and images the business published through SocialBoost, on the Analytics screen and in their client report.
**Screencast:** `analytics.mp4`

### `instagram_manage_comments`
**How we use it:** Optionally, when the user has typed a "first comment" for a post, we post that single comment under the media right after publishing — a common practice for keeping hashtags out of the caption. The comment text is the user's own; we do not read or reply to other people's comments with this permission.
**Screencast:** `publish.mp4`

## 3. The three screencasts (record on the live site, 1–3 minutes each)

Meta wants to see the permission **being used** by a real person in the real app,
with the Facebook login dialog visible. Record the screen (QuickTime on Mac:
File → New Screen Recording), log in as the reviewer account, and narrate
nothing — captions on screen are not needed; the flow must simply be obvious.

**`connect.mp4`** (pages_show_list, business_management, instagram_basic)
1. Open `https://social-media-new-omega.vercel.app/login`, sign in as `meta-reviewer@nadanaloga.com`.
2. Settings → Channels → **Connect Facebook**.
3. The Facebook dialog appears: log in as the Facebook test user, allow the permissions, choose the Page.
4. The picker shows the Page with its Instagram account → **Connect**.
5. Channels now lists the Page and the Instagram account as *Active*.

**`publish.mp4`** (pages_manage_posts, instagram_content_publish, instagram_manage_comments)
1. Compose → Choose a file (a photo) → write a caption → **+ Add a first comment** → type "#review".
2. Both channels ticked → **Publish now**.
3. Posts → show both targets as *published* with **View** links.
4. Click **View** on each: the post is visible on the Page / Instagram, with the first comment under it.
5. Back in Posts → **Remove** → confirm (shows we offer deletion from the dashboard).

**`analytics.mp4`** (pages_read_engagement, read_insights, instagram_manage_insights)
1. Analytics → the stat tiles, the engagement chart, "Engagement by channel", "Best performing posts".
2. Click **Refresh figures**.
3. Click **📄 Client report** → the branded report with audience sizes.

## 4. The submission form — "Tell us how you'll use…" (general notes box)

Paste this in the "Additional notes" / "Provide detailed step-by-step instructions" box:

```
SocialBoost (socialboost by Nadanaloga Fine Arts Academy, Chennai) is a social
media publishing tool for small businesses in India. A business signs in to our
app, connects its own Facebook Page and the linked Instagram business account,
writes or designs a post, and publishes or schedules it. Afterwards it sees the
engagement of those posts.

Test login for our app:
  https://social-media-new-omega.vercel.app/login
  meta-reviewer@nadanaloga.com / Reviewer-cc60627bdb82

Steps to test:
1. Sign in to our app with the credentials above.
2. Settings → Channels → Connect Facebook. Log in with the Facebook test user
   provided below and allow the permissions; choose the test Page.
3. Compose → add a photo, a caption and a first comment → Publish now.
4. Posts shows the result per channel with a link to the live post.
5. Analytics shows engagement for the published posts and a client report.

Each permission is used only for the Pages and Instagram accounts the user
explicitly connected, only on the user's action (Publish / Schedule / view
Analytics). Users can disconnect a channel at any time (Channels → Remove), which
deletes the stored token, and can request deletion of all data at
https://social-media-new-omega.vercel.app/data-deletion.html. Our deauthorize
callback removes a user's tokens when they remove the app on Facebook.
```

## 5. After approval

1. App settings → Basic → **App Mode: Live** (top toggle).
2. In Vercel / Portainer set `VITE_META_INSTAGRAM_ENABLED=true` (if it was false) and redeploy.
3. Remove the pilot customers from App roles → Testers (they no longer need it).
4. Tell customers: Settings → Channels → Connect Facebook.

## Until approval: pilot customers

App Dashboard → **App roles → Roles → Add Testers** → enter the customer's
Facebook name or email. They accept the invite at
developers.facebook.com → My apps (a yellow bar appears). After accepting,
Connect Facebook works for them exactly as it will for everyone later.
