# 🔑 Google Cloud Setup Guide for HireLog

Follow these steps **once** to enable Google Sheets sync. Takes about 5 minutes.

---

## Step 1 — Get Your Extension ID

1. Open Chrome → go to **`chrome://extensions`**
2. Enable **Developer mode** (top-right toggle)
3. Find HireLog in the list
4. Copy the **Extension ID** shown below the extension name  
   *(looks like: `abcdefghijklmnopqrstuvwxyzabcdef`)*

> [!IMPORTANT]
> Keep this tab open — you'll need the Extension ID in Step 3.

---

## Step 2 — Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Name it: `HireLog` (or anything you like)
4. Click **Create** and wait for it to be ready

---

## Step 3 — Enable Required APIs

1. In the Cloud Console, go to **APIs & Services → Library**
2. Search for **"Google Sheets API"** → click it → click **Enable**
3. Go back to Library, search for **"Google Drive API"** → click it → click **Enable**

---

## Step 4 — Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **"External"** → click **Create**
3. Fill in:
   - **App name**: `HireLog`
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**
5. On the **Scopes** page → click **Save and Continue** (skip for now)
6. On the **Test users** page → Add your Gmail address → click **Save and Continue**
7. Click **Back to Dashboard**

> [!NOTE]
> The app will be in "Testing" mode, which means only the emails you add as test users can sign in.
> This is perfect for personal use. If you want to share with others, you'll need to publish the app.

---

## Step 5 — Create OAuth Credentials

1. Go to **APIs & Services → Credentials**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. For **Application type**, select: **Chrome Extension**
4. For **Name**, enter: `HireLog Extension`
5. For **Extension ID**, paste the ID you copied in Step 1
6. Click **Create**
7. A dialog appears — copy the **Client ID** value  
   *(looks like: `123456789-abcdefgh.apps.googleusercontent.com`)*

---

## Step 6 — Add Client ID to the Extension

1. Open the file:  
   `career_tracker_extension/manifest.json`

2. Find this line:
   ```json
   "client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
   ```

3. Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID:
   ```json
   "client_id": "123456789-abcdefgh.apps.googleusercontent.com",
   ```

4. Save the file.

---

## Step 7 — Reload the Extension

1. Go back to **`chrome://extensions`**
2. Click the **refresh icon** (↺) on the HireLog card
3. Open the HireLog dashboard → Settings tab
4. Click **"Sign in with Google"** → approve the consent screen
5. ✅ Done! HireLog will now auto-sync to Google Sheets.

---

## 🔒 Privacy & Security Explained

HireLog requests only the **minimum possible permissions** from Google:

| Permission | What it allows | What it does NOT allow |
|---|---|---|
| `drive.file` | Create & edit files HireLog creates | Read/write ANY other Drive file |
| `email` | See your email address | Access Gmail or contacts |
| `profile` | See your name & photo | Access calendar or personal data |

**The consent screen will say:**
> *"See, edit, create, and delete only the specific Google Drive files you use with this app"*

This is the most restrictive Drive scope available. Your photos, documents, other spreadsheets — **completely inaccessible** to HireLog.

---

## 🛠 Troubleshooting

**"This app isn't verified" warning?**
→ Click **"Advanced"** → **"Go to HireLog (unsafe)"**. This appears because the app is in Testing mode (not submitted to Google for review). It's your own app — it's safe.

**"OAuth2 not granted" error?**
→ Make sure you added your Gmail as a Test User in Step 4, and that the Extension ID matches exactly.

**Auth screen doesn't appear?**
→ Try reloading the extension from `chrome://extensions` after updating the client_id in manifest.json.

**Token expired after some time?**
→ Normal behavior. Just click Sign In again — Chrome will sign you in silently without showing a consent screen again (until you sign out).

---

## 🚀 What Happens After Setup

Every time you save a job application from the popup:

1. Application is saved locally (chrome.storage)  
2. **Google Sheets is automatically updated** with all your applications  
3. The sheet is always at: **Google Drive → "HireLog — Job Application Tracker"**  
4. Open it from Dashboard → Settings → "Open in Sheets"

The sheet has a formatted header row, frozen top row, and auto-sized columns.
