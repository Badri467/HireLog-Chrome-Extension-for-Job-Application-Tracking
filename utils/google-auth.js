// utils/google-auth.js — Google OAuth2 via chrome.identity API
//
// Uses chrome.identity.getAuthToken which:
//   - Handles token caching automatically
//   - Refreshes expired tokens silently
//   - Shows the Google account picker if needed
//   - Works without any server-side code
//
// Security: requests only "drive.file" scope — the most restrictive
// possible. HireLog can ONLY see files it creates, never any other
// files in the user's Drive.

'use strict';

const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_REVOKE_URL   = 'https://oauth2.googleapis.com/revoke';

// ──────────────────────────────────────────────
// Core token retrieval (wraps chrome.identity.getAuthToken)
// ──────────────────────────────────────────────

function chromeGetAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else if (!token) {
        reject(new Error('No token returned'));
      } else {
        resolve(token);
      }
    });
  });
}

function chromeRemoveCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

// ──────────────────────────────────────────────
// Sign in — interactive OAuth consent flow
// Returns user info on success, throws on error/cancel
// ──────────────────────────────────────────────

async function googleSignIn() {
  let token;
  try {
    token = await chromeGetAuthToken(true);
  } catch (err) {
    // Check if this is a configuration error
    const msg = err.message || '';
    if (
      msg.includes('client_id') ||
      msg.includes('OAuth2') ||
      msg.includes('not granted') ||
      msg.includes('Invalid Scope') ||
      msg.includes('Configuration')
    ) {
      throw Object.assign(new Error('SETUP_REQUIRED'), { original: msg });
    }
    if (msg.includes('canceled') || msg.includes('cancelled') || msg.includes('dismissed')) {
      throw new Error('CANCELLED');
    }
    throw err;
  }

  // Fetch user profile with the token
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  const user = await res.json();

  // Persist the signed-in state and profile
  await chrome.storage.local.set({
    google_signed_in:   true,
    google_user_email:  user.email  || '',
    google_user_name:   user.name   || user.email || '',
    google_user_picture:user.picture || '',
  });

  return {
    email:   user.email,
    name:    user.name || user.email,
    picture: user.picture || '',
  };
}

// ──────────────────────────────────────────────
// Sign out — revoke token + wipe all Google state
// ──────────────────────────────────────────────

async function googleSignOut() {
  // Try to get the current token to revoke it
  try {
    const token = await chromeGetAuthToken(false);
    if (token) {
      // Revoke on Google's servers (best-effort)
      fetch(`${GOOGLE_REVOKE_URL}?token=${token}`, { method: 'POST' }).catch(() => {});
      // Remove from Chrome's internal cache
      await chromeRemoveCachedToken(token);
    }
  } catch (_) {
    // Already signed out or no token — fine
  }

  // Clear all HireLog Google-related storage
  await chrome.storage.local.remove([
    'google_signed_in',
    'google_user_email',
    'google_user_name',
    'google_user_picture',
    'hirelog_sheet_id',
    'hirelog_sheet_url',
    'hirelog_gsheet_tab_id',
    'last_sync_time',
  ]);
}

// ──────────────────────────────────────────────
// Check if user is currently signed in
// (non-interactive — no popup)
// ──────────────────────────────────────────────

async function isGoogleSignedIn() {
  const { google_signed_in } = await chrome.storage.local.get('google_signed_in');
  if (!google_signed_in) return false;
  try {
    const token = await chromeGetAuthToken(false);
    return !!token;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────
// Get stored user info (no network call)
// ──────────────────────────────────────────────

async function getGoogleUserInfo() {
  const data = await chrome.storage.local.get([
    'google_signed_in',
    'google_user_email',
    'google_user_name',
    'google_user_picture',
  ]);
  if (!data.google_signed_in) return null;
  return {
    email:   data.google_user_email   || '',
    name:    data.google_user_name    || '',
    picture: data.google_user_picture || '',
  };
}

// ──────────────────────────────────────────────
// Get a fresh Bearer token for API calls
// Returns null if not signed in (non-interactive)
// ──────────────────────────────────────────────

async function getGoogleTokenForApi() {
  try {
    return await chromeGetAuthToken(false);
  } catch {
    return null;
  }
}
