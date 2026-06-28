# HireLog — Job Application Tracker Extension

> Track every job application automatically from **any** career portal. One-click save, Google Sheets cloud sync, smart duplicate detection, and follow-up reminders.

---

## 🚀 Quick Setup

### Step 1 — Load in Chrome (Local Testing)

1. Open Chrome and go to **`chrome://extensions`**
2. Toggle **Developer mode** ON (top-right switch)
3. Click **"Load unpacked"**
4. Select the **`career_tracker_extension`** folder
5. ✅ HireLog appears in your toolbar!

### Step 2 — Link Google Sheets (OAuth Sync)

1. Click the HireLog icon in your toolbar and open the **Dashboard**.
2. Go to the **Google Sync** panel on the left/top.
3. Click **"Sign in with Google"** and complete the OAuth consent screen.
4. Once signed in, HireLog will automatically create a spreadsheet named **"HireLog Job Applications"** in your Google Drive (or link to an existing one).
5. ✅ Every future saved application automatically syncs to your Google Sheet!

---

## 📖 How to Use

### Logging a Job Application

1. **Visit any job posting** (LinkedIn, Indeed, Greenhouse, Lever, etc.)
2. **Click the HireLog icon** in your Chrome toolbar.
3. The extension **auto-fills** the company name, job role, and application URL from the page.
4. Choose the status (Applied, Interviewing, Offered, etc.), check if it is a referral, and add notes.
5. Click **"Save Application"**.
6. The app instantly checks for duplicates and saves the job locally, then automatically syncs it to your Google Sheet.

### Smart Duplicate Detection

If you try to save a job application that matches a company and role you already tracked, HireLog will alert you. You can choose to:
- Update the existing application with new notes/status.
- Save it as a new separate application.

---

## 📅 Dashboard Features

| Feature | Description |
|---|---|
| **📋 Applications** | Sortable, searchable table displaying all jobs. Update status inline instantly. |
| **🗂️ Kanban Board** | Interactive drag-and-drop workspace to move applications between status stages. |
| **📅 Timeline** | Grouped overview of your job search progress over time (by month). |
| **🔒 Google Sync** | Safe cloud sync with sign-in / sign-out and manual sync trigger. |
| **⚙ Settings** | Clear all local data, configure reminders (7, 14, 30 days). |

---

## 🔒 Privacy & Security

* **Direct Cloud Connection:** We do not own or run external database servers. Your data is synced directly from your browser to your own personal Google Account.
* **On-Demand Permission:** The extension does not read your browsing history. It only runs script execution when you explicitly click the extension icon (`activeTab` model).
* **Local Fallback:** Unsynced data is stored safely in your browser's local `chrome.storage` database.

---

## 🗂️ Project Structure

```
career_tracker_extension/
├── manifest.json              # Extension manifest (MV3, OAuth, Permissions)
├── background/
│   └── service-worker.js      # Alarms, notifications, background syncing
├── content/
│   └── content-script.js      # On-demand DOM parser for career portal sites
├── popup/
│   ├── popup.html             # Popup interface when extension icon is clicked
│   ├── popup.css              # Glassmorphic UI styles for popup
│   └── popup.js               # Popup logic, auto-fill, and duplicate check
├── dashboard/
│   ├── dashboard.html         # Workspace dashboard (Kanban, Table, Timeline)
│   ├── dashboard.css          # Glassmorphic UI dashboard styling
│   └── dashboard.js           # Dashboard UI tabs, table sorting, Kanban drag-drop
├── utils/
│   ├── google-auth.js         # Chrome Identity API helper for Google OAuth 2.0
│   ├── sheets-api.js          # REST Client for Google Sheets API integration
│   └── helpers.js             # Shared helpers (date parsing, text normalization)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

---

*Built with ❤️ using Chrome Extension Manifest V3*
