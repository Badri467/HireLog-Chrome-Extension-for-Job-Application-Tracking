// popup/popup.js — HireLog Popup Logic

'use strict';

let jobDescriptionSnapshot = '';

// ──────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Set today's date as default
  document.getElementById('dateApplied').value = getTodayISO();

  // Load stats from storage & update footer
  await refreshStats();

  // Try to extract job data from the active tab
  await loadJobDataFromTab();

  // Wire up all event listeners
  bindEvents();
});

// ──────────────────────────────────────────────
// Extract job data from the current active tab
// ──────────────────────────────────────────────

async function loadJobDataFromTab() {
  const badge = document.getElementById('detectionBadge');

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (e) {
    setManualMode();
    return;
  }

  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    setManualMode();
    return;
  }

  let data = null;

  // Try messaging the already-injected content script first
  try {
    data = await chrome.tabs.sendMessage(tab.id, { action: 'extractJobData' });
  } catch (_) {
    // Content script not yet loaded — inject it on demand
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.js'],
      });
      // Brief pause for the script to initialize
      await sleep(120);
      data = await chrome.tabs.sendMessage(tab.id, { action: 'extractJobData' });
    } catch (e) {
      data = null;
    }
  }

  if (data && data.isJobPage && (data.title || data.company)) {
    // Auto-detected job posting
    badge.textContent = 'Job detected';
    badge.className = 'detection-badge detected';

    if (data.title)   document.getElementById('role').value        = data.title;
    if (data.company) document.getElementById('company').value     = data.company;
    if (data.url)     document.getElementById('postingUrl').value  = data.url;
    if (data.location)document.getElementById('location').value    = data.location;
    if (data.salary)  document.getElementById('salary').value      = data.salary;
    if (data.description) jobDescriptionSnapshot = data.description;

    // Focus the first empty required field
    if (!data.company) document.getElementById('company').focus();
    else if (!data.title) document.getElementById('role').focus();
    else document.getElementById('saveBtn').focus();
  } else {
    // Not a job page — manual entry
    setManualMode(tab.url);
  }
}

function setManualMode(tabUrl) {
  const badge = document.getElementById('detectionBadge');
  badge.textContent = 'Manual entry';
  badge.className = 'detection-badge manual';

  // Still fill the URL if it's a valid http(s) link
  if (tabUrl && (tabUrl.startsWith('http://') || tabUrl.startsWith('https://'))) {
    document.getElementById('postingUrl').value = tabUrl;
  }

  document.getElementById('company').focus();
}

// ──────────────────────────────────────────────
// Event bindings
// ──────────────────────────────────────────────

function bindEvents() {
  // Referral toggle → show/hide "Referred By" name field
  document.getElementById('isReferral').addEventListener('change', (e) => {
    const nameInput = document.getElementById('referredBy');
    if (e.target.checked) {
      nameInput.classList.remove('hidden');
      nameInput.focus();
    } else {
      nameInput.classList.add('hidden');
      nameInput.value = '';
    }
  });

  // Notes section expand/collapse
  document.getElementById('notesToggle').addEventListener('click', () => {
    const body = document.getElementById('notesBody');
    const btn  = document.getElementById('notesToggle');
    const isOpen = !body.classList.contains('hidden');

    if (isOpen) {
      body.classList.add('hidden');
      btn.textContent = 'Add Notes & Details';
      btn.setAttribute('aria-expanded', 'false');
    } else {
      body.classList.remove('hidden');
      btn.textContent = 'Hide Notes & Details';
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  // Form submit
  document.getElementById('applicationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSave();
  });

  // Open Dashboard tab
  document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
    window.close();
  });

  // Sync status → opens dashboard at settings tab
  document.getElementById('syncStatus').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') + '#settings' });
    window.close();
  });

  document.getElementById('syncStatus').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') + '#settings' });
      window.close();
    }
  });
}

// ──────────────────────────────────────────────
// Save application
// ──────────────────────────────────────────────

async function handleSave() {
  const company = document.getElementById('company').value.trim();
  const role    = document.getElementById('role').value.trim();

  if (!company) { showError('Please enter the Company name.'); document.getElementById('company').focus(); return; }
  if (!role)    { showError('Please enter the Role / Position.'); document.getElementById('role').focus(); return; }

  const dateApplied  = document.getElementById('dateApplied').value  || getTodayISO();
  const postingUrl   = document.getElementById('postingUrl').value.trim();
  const isReferral   = document.getElementById('isReferral').checked;
  const referredBy   = document.getElementById('referredBy').value.trim();
  const notes        = document.getElementById('notes').value.trim();
  const recruiterName= document.getElementById('recruiterName').value.trim();
  const location     = document.getElementById('location').value.trim();
  const salary       = document.getElementById('salary').value.trim();

  const app = {
    id:            generateId(),
    company,
    role,
    postingUrl,
    dateApplied,
    status:        document.getElementById('status').value,
    isReferral,
    referredBy:    isReferral ? referredBy : '',
    notes,
    recruiterName,
    source:        detectPortal(postingUrl),
    followUpDate:  getFollowUpDate(dateApplied, 7),
    jobDescription:jobDescriptionSnapshot,
    location,
    salary,
    dateCreated:   new Date().toISOString(),
    lastUpdated:   new Date().toISOString(),
  };

  setSaveLoading(true);
  clearError();

  try {
    // 1. Load existing applications
    const { applications: existing = [] } = await chrome.storage.local.get('applications');

    // 2. Detect duplicates and let the user update instead of creating clutter
    const duplicate = findDuplicateApplication(existing, app);
    let applications;
    let savedApp = app;

    if (duplicate) {
      const shouldUpdate = confirm(
        `This job already looks tracked:\n\n${duplicate.role} at ${duplicate.company}\n\n` +
        'Click OK to update the existing record, or Cancel to save a separate entry.'
      );

      if (shouldUpdate) {
        savedApp = {
          ...duplicate,
          ...app,
          id: duplicate.id,
          dateCreated: duplicate.dateCreated || app.dateCreated,
          jobDescription: app.jobDescription || duplicate.jobDescription || '',
          lastUpdated: new Date().toISOString(),
        };
        applications = [savedApp, ...existing.filter(item => item.id !== duplicate.id)];
      } else {
        applications = [app, ...existing];
      }
    } else {
      // Prepend new application (newest first)
      applications = [app, ...existing];
    }

    // 3. Persist to chrome.storage.local
    await chrome.storage.local.set({ applications });

    // 4. Sync to Google Sheets (primary) or local CSV (fallback)
    let synced = false;
    let syncLabel = '';
    try {
      const signedIn = await isGoogleSignedIn().catch(() => false);
      if (signedIn) {
        await syncToGoogleSheets(applications);
        synced = true;
        syncLabel = 'Google Sheets';
      } else {
        // Fall back to local CSV file if one was linked
        const ok = await syncToExcelFile(applications).catch(() => false);
        if (ok) { synced = true; syncLabel = 'CSV file'; }
      }
    } catch (syncErr) {
      console.warn('HireLog: Sync failed (will retry on next save):', syncErr);
    }

    // 5. Show success animation
    showSuccess(savedApp.company, savedApp.role, synced, syncLabel, !!duplicate && savedApp.id === duplicate.id);

    // 6. Auto-close after 2.5 seconds
    setTimeout(() => window.close(), 2500);

  } catch (err) {
    console.error('HireLog save error:', err);
    showError('Failed to save. Please try again.');
    setSaveLoading(false);
  }
}

// ──────────────────────────────────────────────
// UI helpers
// ──────────────────────────────────────────────

async function refreshStats() {
  const { applications = [] } = await chrome.storage.local.get('applications');
  document.getElementById('totalApps').textContent = `${applications.length} tracked`;

  const syncEl = document.getElementById('syncStatus');

  // Prefer Google Sheets status; fall back to local file status
  const signedIn = await isGoogleSignedIn().catch(() => false);

  if (signedIn) {
    const user = await getGoogleUserInfo();
    const email = user?.email || 'Google';
    const { hirelog_sheet_id } = await chrome.storage.local.get('hirelog_sheet_id');
    const lastSync = await getLastSyncTime();
    const lastSyncStr = lastSync ? ` • ${formatSyncTime(lastSync)}` : '';
    syncEl.textContent = `${email}${lastSyncStr}`;
    syncEl.title = `Auto-syncing to Google Sheets — click to manage`;
  } else {
    syncEl.textContent = 'Connect Google Sheets';
    syncEl.title = 'Click to sign in with Google and enable cloud sync';
  }
}

function showSuccess(company, role, synced, syncLabel, wasUpdated = false) {
  document.getElementById('successCompany').textContent = company;
  document.getElementById('successRole').textContent    = role;

  let subText = wasUpdated ? '✓ Existing record updated' : '✓ Saved to HireLog';
  if (synced && syncLabel === 'Google Sheets') {
    subText = wasUpdated ? 'Updated • Synced to Google Sheets' : 'Saved • Synced to Google Sheets';
  } else if (synced && syncLabel === 'CSV file') {
    subText = wasUpdated ? '✓ Updated • Synced to CSV file' : '✓ Saved • Synced to CSV file';
  } else {
    subText = wasUpdated ? '✓ Updated locally • Sign in to Google to sync' : '✓ Saved locally • Sign in to Google to sync';
  }

  document.getElementById('successSub').textContent = subText;
  document.getElementById('successOverlay').classList.add('show');
}

function findDuplicateApplication(applications, candidate) {
  const candidateUrl = normalizeUrl(candidate.postingUrl);
  const candidateCompany = normalizeText(candidate.company);
  const candidateRole = normalizeText(candidate.role);

  return applications.find(app => {
    const appUrl = normalizeUrl(app.postingUrl);
    if (candidateUrl && appUrl && candidateUrl === appUrl) return true;

    return normalizeText(app.company) === candidateCompany &&
           normalizeText(app.role) === candidateRole;
  }) || null;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param =>
      url.searchParams.delete(param)
    );
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value).trim().replace(/\/$/, '');
  }
}

function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.add('show');
}

function clearError() {
  const el = document.getElementById('errorMsg');
  el.classList.remove('show');
  el.textContent = '';
}

function setSaveLoading(loading) {
  const btn  = document.getElementById('saveBtn');
  const text = document.getElementById('saveBtnText');
  btn.disabled = loading;
  if (loading) {
    text.innerHTML = '<span class="spinner"></span> Saving…';
  } else {
    text.textContent = 'Save Application';
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
