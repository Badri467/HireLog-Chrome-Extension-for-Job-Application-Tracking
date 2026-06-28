// utils/sheets-api.js — Google Sheets API v4 operations for HireLog
//
// Privacy model:
//   Scope used: "drive.file" — the most restrictive Drive permission.
//   HireLog can ONLY access the one spreadsheet it creates.
//   It cannot see, read, or list any other files in the user's Drive.
//
// Sheet structure:
//   Spreadsheet: "HireLog — Job Application Tracker"
//   Sheet tab:   "Applications"
//   Header row:  Frozen, purple background, white bold text (auto-formatted)

'use strict';

const SHEETS_BASE    = 'https://sheets.googleapis.com/v4/spreadsheets';
const SPREADSHEET_TITLE = 'HireLog — Job Application Tracker';
const SHEET_TAB_NAME    = 'Applications';

// Column definitions — order matters for the sheet layout
const SHEET_COLUMNS = [
  'Company',
  'Role / Position',
  'Status',
  'Date Applied',
  'Source / Portal',
  'Is Referral',
  'Referred By',
  'Recruiter Name',
  'Location',
  'Salary / Package',
  'Follow-up Date',
  'Days Since Applied',
  'Notes',
  'Job Posting URL',
  'Last Updated',
];

// ──────────────────────────────────────────────
// Authenticated fetch wrapper
// Automatically retries once on 401 (expired token)
// ──────────────────────────────────────────────

async function sheetsApiFetch(url, options = {}) {
  let token = await getGoogleTokenForApi();
  if (!token) throw new Error('NOT_SIGNED_IN');

  const makeRequest = (t) =>
    fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

  let res = await makeRequest(token);

  // If 401: token expired — remove from cache, get fresh, retry once
  if (res.status === 401) {
    await chromeRemoveCachedToken(token);
    token = await getGoogleTokenForApi();
    if (!token) throw new Error('NOT_SIGNED_IN');
    res = await makeRequest(token);
  }

  if (res.status === 404) throw new Error('SHEET_NOT_FOUND');
  if (res.status === 403) throw new Error('PERMISSION_DENIED');

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errMsg = body?.error?.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  // 204 No Content → return null; otherwise parse JSON
  return res.status === 204 ? null : res.json();
}

// ──────────────────────────────────────────────
// Create the HireLog spreadsheet (called once)
// Applies purple header formatting automatically
// ──────────────────────────────────────────────

async function createHireLogSpreadsheet() {
  const body = {
    properties: {
      title: SPREADSHEET_TITLE,
    },
    sheets: [{
      properties: {
        title: SHEET_TAB_NAME,
        index: 0,
        gridProperties: {
          frozenRowCount: 1,        // Freeze header row
          columnCount: SHEET_COLUMNS.length + 2,
          rowCount: 2000,
        },
        tabColor: { red: 0.486, green: 0.227, blue: 0.929 }, // Purple tab
      },
    }],
  };

  const res = await sheetsApiFetch(SHEETS_BASE, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const spreadsheetId  = res.spreadsheetId;
  const spreadsheetUrl = res.spreadsheetUrl;
  const tabId          = res.sheets[0].properties.sheetId; // internal numeric ID

  // Store for future use
  await chrome.storage.local.set({
    hirelog_sheet_id:       spreadsheetId,
    hirelog_sheet_url:      spreadsheetUrl,
    hirelog_gsheet_tab_id:  tabId,
  });

  // Apply formatting (purple header, auto-resize columns)
  await formatSpreadsheet(spreadsheetId, tabId);

  return spreadsheetId;
}

// ──────────────────────────────────────────────
// Apply visual formatting to the spreadsheet
// ──────────────────────────────────────────────

async function formatSpreadsheet(spreadsheetId, tabId) {
  const columnWidths = [
    140, // Company
    170, // Role / Position
    100, // Status
    110, // Date Applied
    130, // Source / Portal
    90,  // Is Referral
    120, // Referred By
    130, // Recruiter Name
    130, // Location
    120, // Salary / Package
    110, // Follow-up Date
    130, // Days Since Applied
    320, // Notes
    200, // Job Posting URL
    145, // Last Updated
  ];

  const requests = [];

  // 1. Fetch existing conditional formatting rules so we can delete them
  // (preventing stacked duplicate rules on subsequent syncs)
  try {
    const sheetInfo = await sheetsApiFetch(
      `${SHEETS_BASE}/${spreadsheetId}?ranges=${encodeURIComponent(SHEET_TAB_NAME)}&fields=sheets(properties(sheetId),conditionalFormats)`
    );
    const sheet = sheetInfo?.sheets?.find(s => s.properties?.sheetId === tabId);
    const existingRulesCount = sheet?.conditionalFormats?.length || 0;
    for (let i = 0; i < existingRulesCount; i++) {
      requests.push({
        deleteConditionalFormatRule: {
          index: 0,
          sheetId: tabId,
        },
      });
    }
  } catch (err) {
    console.warn('Failed to query/clear existing conditional formatting rules:', err);
  }

  // 2. Add structural & visual formatting requests
  requests.push(
    // Header row: purple background + white bold text
    {
      repeatCell: {
        range: {
          sheetId: tabId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: SHEET_COLUMNS.length,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.486, green: 0.227, blue: 0.929 }, // #7c3aed
            textFormat: {
              foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
              bold: true,
              fontSize: 10,
              fontFamily: 'Arial',
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'CLIP',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    },

    // Set header row height to 34px
    {
      updateDimensionProperties: {
        range: { sheetId: tabId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 34 },
        fields: 'pixelSize',
      },
    },

    // Set data rows height to 26px (for index 1 to 2000)
    {
      updateDimensionProperties: {
        range: { sheetId: tabId, dimension: 'ROWS', startIndex: 1, endIndex: 2000 },
        properties: { pixelSize: 26 },
        fields: 'pixelSize',
      },
    },

    // Default formatting for all data cells (row 1 onwards): Arial 10, Left-align, Middle-align, Clip wrap
    {
      repeatCell: {
        range: {
          sheetId: tabId,
          startRowIndex: 1,
          endRowIndex: 2000,
          startColumnIndex: 0,
          endColumnIndex: SHEET_COLUMNS.length,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              fontSize: 10,
              fontFamily: 'Arial',
            },
            horizontalAlignment: 'LEFT',
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'CLIP',
          },
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
      },
    }
  );

  // Add individual column width requests
  columnWidths.forEach((width, index) => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId: tabId,
          dimension: 'COLUMNS',
          startIndex: index,
          endIndex: index + 1,
        },
        properties: { pixelSize: width },
        fields: 'pixelSize',
      },
    });
  });

  // Center-align specific columns (Status, Date Applied, Is Referral, Follow-up Date, Days Since Applied, Last Updated)
  const centerCols = [2, 3, 5, 10, 11, 14];
  centerCols.forEach(colIndex => {
    requests.push({
      repeatCell: {
        range: {
          sheetId: tabId,
          startRowIndex: 1,
          endRowIndex: 2000,
          startColumnIndex: colIndex,
          endColumnIndex: colIndex + 1,
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment)',
      },
    });
  });

  // Wrap text for Notes (12)
  requests.push({
    repeatCell: {
      range: {
        sheetId: tabId,
        startRowIndex: 1,
        endRowIndex: 2000,
        startColumnIndex: 12,
        endColumnIndex: 13,
      },
      cell: {
        userEnteredFormat: {
          wrapStrategy: 'WRAP',
        },
      },
      fields: 'userEnteredFormat(wrapStrategy)',
    },
  });

  // Freeze the header row
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId: tabId,
        gridProperties: { frozenRowCount: 1 },
      },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  // 3. Define status colors (soft pastels for light mode Google Sheets)
  const statusColors = {
    'In Progress': { bg: '#F1F5F9', text: '#475569' },
    'Applied':     { bg: '#EFF6FF', text: '#1D4ED8' },
    'Screening':   { bg: '#FFFBEB', text: '#B45309' },
    'Interview':   { bg: '#F5F3FF', text: '#6D28D9' },
    'Offer':       { bg: '#ECFDF5', text: '#047857' },
    'Rejected':    { bg: '#FEF2F2', text: '#B91C1C' },
    'Ghosted':     { bg: '#F9FAFB', text: '#9CA3AF' },
    'Withdrawn':   { bg: '#F3F4F6', text: '#6B7280' },
  };

  // Add conditional formatting rules for Status column (Column C, index 2)
  Object.entries(statusColors).forEach(([status, colors]) => {
    requests.push({
      addConditionalFormatRule: {
        rule: {
          ranges: [{
            sheetId: tabId,
            startRowIndex: 1,
            endRowIndex: 2000,
            startColumnIndex: 2,
            endColumnIndex: 3,
          }],
          booleanRule: {
            condition: {
              type: 'TEXT_EQ',
              values: [{ userEnteredValue: status }],
            },
            format: {
              backgroundColor: hexToRgbColor(colors.bg),
              textFormat: {
                foregroundColor: hexToRgbColor(colors.text),
                bold: true,
              },
            },
          },
        },
        index: 0,
      },
    });
  });

  await sheetsApiFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

// ──────────────────────────────────────────────
// Get or create the spreadsheet
// Verifies it still exists; re-creates if deleted
// ──────────────────────────────────────────────

async function getOrCreateSheet() {
  const { hirelog_sheet_id } = await chrome.storage.local.get('hirelog_sheet_id');

  if (hirelog_sheet_id) {
    try {
      // Quick probe — only fetch metadata, not full sheet content
      await sheetsApiFetch(
        `${SHEETS_BASE}/${hirelog_sheet_id}?fields=spreadsheetId`,
        { headers: { 'Content-Type': undefined } }
      );
      return hirelog_sheet_id; // Sheet exists and is accessible
    } catch (err) {
      if (err.message === 'SHEET_NOT_FOUND') {
        // User deleted the sheet — clear stored ID and create a fresh one
        await chrome.storage.local.remove([
          'hirelog_sheet_id',
          'hirelog_sheet_url',
          'hirelog_gsheet_tab_id',
        ]);
      } else {
        throw err; // Network error, permission issue etc. — propagate
      }
    }
  }

  // Create a new spreadsheet
  return createHireLogSpreadsheet();
}

// ──────────────────────────────────────────────
// MAIN SYNC FUNCTION
// Writes all applications to the Google Sheet.
// Strategy: clear existing data → write header + all rows
// This gives "create if new / overwrite with full dataset" behavior.
// ──────────────────────────────────────────────

async function syncToGoogleSheets(applications) {
  const spreadsheetId = await getOrCreateSheet();

  // Build the 2D array of values
  const dataRows = applications.map(app => [
    app.company        || '',
    app.role           || '',
    app.status         || '',
    app.dateApplied    || '',
    app.source         || '',
    app.isReferral ? 'Yes' : 'No',
    app.referredBy     || '',
    app.recruiterName  || '',
    app.location       || '',
    app.salary         || '',
    app.followUpDate   || '',
    getDaysSince(app.dateApplied),
    (app.notes         || '').substring(0, 500), // cap to avoid cell size limits
    app.postingUrl ? `=HYPERLINK("${app.postingUrl.replace(/"/g, '""')}", "Open Link")` : '',
    app.lastUpdated
      ? new Date(app.lastUpdated).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
      : '',
  ]);

  const allValues = [SHEET_COLUMNS, ...dataRows];
  const range     = `${SHEET_TAB_NAME}!A1:${columnLetter(SHEET_COLUMNS.length)}${allValues.length}`;

  // Step 1: Clear existing content (keeps formatting)
  await sheetsApiFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(SHEET_TAB_NAME + '!A1:Z5000')}:clear`,
    { method: 'POST', body: '{}' }
  );

  // Step 2: Write all data in one request
  await sheetsApiFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: allValues,
      }),
    }
  );

  // Step 3: Re-apply header formatting (clear() removes cell format)
  const { hirelog_gsheet_tab_id } = await chrome.storage.local.get('hirelog_gsheet_tab_id');
  if (hirelog_gsheet_tab_id !== undefined) {
    await formatSpreadsheet(spreadsheetId, hirelog_gsheet_tab_id).catch(() => {});
  }

  const syncTime = new Date().toISOString();
  await chrome.storage.local.set({ last_sync_time: syncTime });

  return {
    spreadsheetId,
    rowCount: dataRows.length,
    syncTime,
  };
}

// ──────────────────────────────────────────────
// Helper: get the spreadsheet URL
// ──────────────────────────────────────────────

async function getSheetUrl() {
  const { hirelog_sheet_url, hirelog_sheet_id } =
    await chrome.storage.local.get(['hirelog_sheet_url', 'hirelog_sheet_id']);
  if (hirelog_sheet_url) return hirelog_sheet_url;
  if (hirelog_sheet_id)
    return `https://docs.google.com/spreadsheets/d/${hirelog_sheet_id}/edit`;
  return null;
}

// ──────────────────────────────────────────────
// Helper: get last sync time + format it
// ──────────────────────────────────────────────

async function getLastSyncTime() {
  const { last_sync_time } = await chrome.storage.local.get('last_sync_time');
  return last_sync_time || null;
}

function formatSyncTime(isoString) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24)return `${hours}h ago`;
  return `${days}d ago`;
}

// ──────────────────────────────────────────────
// Helper: convert column index (0-based) to letter (A, B, ..., Z, AA...)
// ──────────────────────────────────────────────

function columnLetter(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

// ──────────────────────────────────────────────
// Helper: convert hex color string (#RRGGBB) to Google Sheets RGB object (0.0 to 1.0)
// ──────────────────────────────────────────────

function hexToRgbColor(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}
