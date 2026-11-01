# Digital Entertainment

React + Vite site with a Firebase backend: a game library with download links, a Payments page you control from the admin panel, a cash-out request form, and live chat that supports pictures and files. There are no payment gateways and no server functions. Everything runs in the browser against Firebase.

## Local development

```bash
npm install
cp .env.example .env     # then fill in your Firebase keys (see below)
npm run dev
```

Until `.env` is filled in, the site shows a "setup needed" screen instead of crashing.

## Firebase setup (one time)

Use a **new** Firebase project for this site. Do not reuse the project of another site.

1. **Create the project.** [Firebase console](https://console.firebase.google.com) > Add project.
2. **Create the database.** Build > Firestore Database > Create database (production mode).
3. **Turn on sign-in.** Build > Authentication > Sign-in method: enable **Email/Password** and **Anonymous**. Email/Password is used by your admin login and, behind the scenes, by visitor chat accounts (`<username>@chat.digital.example`). Anonymous is for guest chat.
4. **Get the keys.** Project settings > General > Your apps > Add app > Web. Copy the config values into `.env` (names are in `.env.example`).
5. **Create your admin login.** Authentication > Users > Add user (your email and a strong password).
6. **Create the admin marker.** Copy your admin account's **User UID**. Then Firestore Database > Start collection `digitalEntertainment_admins` > Document ID = your UID > add any field, for example `enabled` = `true`. Clients can never write to this collection.
7. **Publish the rules.** Firestore Database > Rules > paste the contents of `firestore.rules` > Publish. Do steps 6 and 7 together: with the rules published but no marker, saving in the admin panel is denied (the admin panel shows a red banner with your UID when this happens).
8. **Log in** at `/admin` with the email and password from step 5.

## Deploying (Vercel)

Import the repository, then add the six `VITE_FIREBASE_*` variables from `.env.example` under Project Settings > Environment Variables and deploy. Redeploy after changing a variable. Add your production domain under Firebase > Authentication > Settings > Authorized domains.

## Payments page

There is no payment API. Under **Admin > Payment methods** you add methods yourself. Each one has a name and any of: account details (shown with a copy button, e.g. a cashtag or account number), a payment link, and a QR code.

Whether visitors can see the page at all is your decision: use the **Payments page** switch at the top of the Payment methods tab (or **Settings > Payments**). When it is off, the Payments link disappears from the menu, the mobile dock and the footer, and `/payments` shows a "closed" notice. The note above the methods, and the closed notice, can be edited under **Admin > Site Text > Payments page**.

## Live chat

Visitors get a floating chat button. They can chat as a guest or with a username and password, and you reply from **Admin > Live Chat**. Chat ships switched off: do the Firebase setup above, then turn on **Admin > Settings > Live chat > Enable live chat for visitors**.

Notes:

- Visitor accounts have **no password reset** (there is no real email address). Tell visitors to remember their password, or just chat as a guest. A guest can create an account later from the chat menu and keeps the history.
- To test as a visitor, use a different browser or a private window. A browser signed in as admin does not show the chat button.
- Reserved usernames (admin, support, staff, ...) cannot be registered.

### Pictures and files in chat

Visitors and the admin can attach with the paperclip button, by pasting a screenshot, or by dragging a file onto the chat.

- **Pictures** are re-encoded to JPEG in the browser before sending. That shrinks them, applies the camera rotation and removes metadata. Each message keeps a small thumbnail; the full picture is stored in `digitalEntertainment_chats/{uid}/images/{id}` and only downloaded when opened.
- **Files** are limited to **PDF, Word (.docx), Excel (.xlsx), CSV and plain text, up to 500 KB each**. The type is decided by the file extension and the first bytes of the file must match it, so an `.exe` renamed to `.pdf` is refused. Old `.doc`/`.xls` (macros), archives, scripts and programs cannot be sent. Files are stored in `digitalEntertainment_chats/{uid}/files/{id}` and the page only ever offers them as a download, never opens them. Scan anything you download as usual, and be careful with formulas in CSV/Excel files from strangers.
- Each attachment can take up to about 700 KB of Firestore storage and the rules cannot limit how many a visitor sends. Turn on **Firebase App Check** (Build > App Check), set a billing alert, and delete old conversations from the Live Chat tab when you no longer need them (this also deletes their pictures and files). Optional: Authentication > Settings > clear anonymous accounts automatically.
- **Re-publish `firestore.rules`** after every update to this project. Without the current rules, sending a picture or file is denied.
