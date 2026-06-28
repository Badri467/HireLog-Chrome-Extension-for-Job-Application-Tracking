// dashboard/dashboard.js — HireLog Full Dashboard Controller

'use strict';

// ──────────────────────────────────────────────
// State
// ──────────────────────────────────────────────

let allApplications = [];
let filteredApplications = [];
let currentTab = 'applications';
let sortState  = { col: 'dateApplied', dir: 'desc' };
let filterStatus = 'All';
let searchQuery  = '';
let editingAppId = null;
let followUpDays = 7;

// ──────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadApplications();
  setupTabs();
  setupTableSorting();
  setupFilters();
  setupModals();
  setupSettingsPanel();
  try { setupGoogleSheetsSection(); } catch (e) { console.warn('Google Sheets setup failed:', e); }
  setupExportButton();
  checkUrlHash();

  // ── Auto-refresh and sync when applications change ──
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.applications) {
      allApplications = changes.applications.newValue || [];
      applyFiltersAndRender();
      updateStats();
      updateFollowUpBadge();
      // Auto-sync updates to Google Sheets in the background
      syncAfterChange().catch(() => {});
    }
  });
});

// ──────────────────────────────────────────────
// Data loading
// ──────────────────────────────────────────────

async function loadApplications() {
  const { applications = [] } = await chrome.storage.local.get('applications');
  allApplications = applications;
  applyFiltersAndRender();
  updateStats();
  updateFollowUpBadge();
}

async function loadSettings() {
  const { hirelog_followup_days = 7 } = await chrome.storage.local.get('hirelog_followup_days');
  followUpDays = hirelog_followup_days;
  // Reflect follow-up days in settings UI
  document.querySelectorAll('.days-option').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.days) === followUpDays);
  });
  // NOTE: Google Sheets status is loaded by setupGoogleSheetsSection() later
}

// ──────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────

function updateStats() {
  const s = computeStats(allApplications);
  animateCounter('stat-total',      s.total);
  animateCounter('stat-inprogress', s.inProgress);
  animateCounter('stat-applied',    s.applied);
  animateCounter('stat-offers',     s.offers);
  document.getElementById('stat-week').textContent = `${s.thisWeek} this week`;
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  const start  = 0;
  const duration = 600;
  const startTime = performance.now();

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const val = Math.round(progress * target);
    el.textContent = val;
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  requestAnimationFrame(tick);
}

function updateFollowUpBadge() {
  const today = getTodayISO();
  const count = allApplications.filter(app => {
    if (app.status !== 'Applied') return false;
    const fu = app.followUpDate || getFollowUpDate(app.dateApplied, followUpDays);
    return fu <= today;
  }).length;

  const badge = document.getElementById('followUpBadge');
  document.getElementById('followUpCount').textContent = count;
  badge.classList.toggle('visible', count > 0);
}

// ──────────────────────────────────────────────
// Filtering & sorting
// ──────────────────────────────────────────────

function applyFiltersAndRender() {
  let apps = [...allApplications];

  // Status filter
  if (filterStatus !== 'All') {
    apps = apps.filter(a => a.status === filterStatus);
  }

  // Search filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    apps = apps.filter(a =>
      a.company?.toLowerCase().includes(q) ||
      a.role?.toLowerCase().includes(q) ||
      a.source?.toLowerCase().includes(q) ||
      a.notes?.toLowerCase().includes(q) ||
      a.recruiterName?.toLowerCase().includes(q)
    );
  }

  // Sort
  apps.sort((a, b) => {
    let va = a[sortState.col] ?? '';
    let vb = b[sortState.col] ?? '';
    if (sortState.col === 'days') {
      va = getDaysSince(a.dateApplied);
      vb = getDaysSince(b.dateApplied);
    }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return sortState.dir === 'asc' ? -1 : 1;
    if (va > vb) return sortState.dir === 'asc' ? 1 : -1;
    return 0;
  });

  filteredApplications = apps;
  renderTable(apps);
  document.getElementById('filterCount').textContent =
    apps.length < allApplications.length
      ? `${apps.length} of ${allApplications.length}`
      : `${apps.length} total`;

  if (currentTab === 'kanban') renderKanban();
  if (currentTab === 'timeline') renderTimeline();
}

function setupFilters() {
  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    applyFiltersAndRender();
  });

  // Status chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filterStatus = chip.dataset.status;
      applyFiltersAndRender();
    });
  });
}

function setupTableSorting() {
  document.querySelectorAll('.app-table th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortState.col === col) {
        sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        sortState.dir = 'asc';
      }
      // Update header indicators
      document.querySelectorAll('.app-table th').forEach(h => h.classList.remove('sorted'));
      th.classList.add('sorted');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = sortState.dir === 'asc' ? '↑' : '↓';
      applyFiltersAndRender();
    });
  });
}

// ──────────────────────────────────────────────
// Table rendering
// ──────────────────────────────────────────────

function renderTable(apps) {
  const tbody      = document.getElementById('appTableBody');
  const emptyState = document.getElementById('emptyState');
  const tableWrap  = document.querySelector('.table-wrap');

  if (apps.length === 0) {
    tbody.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  tbody.innerHTML = apps.map(app => buildTableRow(app)).join('');

  // Bind row events
  tbody.querySelectorAll('.status-select').forEach(sel => {
    applyStatusStyle(sel, sel.value);
    sel.addEventListener('change', async (e) => {
      const id     = e.target.closest('tr').dataset.id;
      const status = e.target.value;
      await updateApplicationField(id, { status });
      applyStatusStyle(e.target, status);
      updateStats();
      updateFollowUpBadge();
      toast(`Status updated to "${status}"`, 'success');
    });
  });

  tbody.querySelectorAll('.edit-btn').forEach(btn =>
    btn.addEventListener('click', () => openEditModal(btn.dataset.id)));

  tbody.querySelectorAll('.delete-btn').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(btn.dataset.id)));

  tbody.querySelectorAll('.jd-btn').forEach(btn =>
    btn.addEventListener('click', () => openJDModal(btn.dataset.id)));
}

function buildTableRow(app) {
  const days = getDaysSince(app.dateApplied);
  const followUp = needsFollowUp(app, followUpDays);
  const style = getStatusStyle(app.status);

  const statusOptions = ['In Progress','Applied','Screening','Interview','Offer','Rejected','Ghosted','Withdrawn']
    .map(s => `<option value="${s}" ${s === app.status ? 'selected' : ''}>${s}</option>`)
    .join('');

  const referralDot = app.isReferral
    ? `<span class="referral-dot" title="Referral${app.referredBy ? ' from ' + escHTML(app.referredBy) : ''}"></span>`
    : '';

  const followUpEl = followUp
    ? `<span class="followup-warn" title="Consider sending a follow-up!">Follow up</span>`
    : `<span style="color:var(--text-muted)">${days}d ago</span>`;

  const hasJD = app.jobDescription && app.jobDescription.length > 10;

  return `
  <tr data-id="${app.id}">
    <td class="td-company">
      <span title="${escHTML(app.company)}">${escHTML(app.company)}</span>
      ${referralDot}
    </td>
    <td class="td-role">
      <span title="${escHTML(app.role)}">${escHTML(app.role)}</span>
    </td>
    <td>
      <select class="status-select"
              style="color:${style.text};background:${style.bg};border-color:${style.border}"
              aria-label="Status for ${escHTML(app.company)}">
        ${statusOptions}
      </select>
    </td>
    <td style="color:var(--text-secondary);white-space:nowrap">${formatDate(app.dateApplied)}</td>
    <td>
      ${app.source ? `<span class="source-chip">${escHTML(app.source)}</span>` : '—'}
    </td>
    <td>${followUpEl}</td>
    <td>
      <div class="actions-cell">
        <button class="icon-btn edit edit-btn" data-id="${app.id}" title="Edit">Edit</button>
        ${hasJD ? `<button class="icon-btn view jd-btn" data-id="${app.id}" title="View Job Description">JD</button>` : ''}
        ${app.postingUrl ? `<a href="${encodeURIAsHref(app.postingUrl)}" target="_blank" rel="noopener" class="icon-btn view" title="Open posting">Open</a>` : ''}
        <button class="icon-btn danger delete-btn" data-id="${app.id}" title="Delete">Del</button>
      </div>
    </td>
  </tr>`;
}

function applyStatusStyle(select, status) {
  const style = getStatusStyle(status);
  select.style.color       = style.text;
  select.style.background  = style.bg;
  select.style.borderColor = style.border;
}

// ──────────────────────────────────────────────
// Kanban rendering
// ──────────────────────────────────────────────

const KANBAN_COLUMNS = [
  { status: 'In Progress', color: '#64748b' },
  { status: 'Applied',   color: '#2563eb' },
  { status: 'Screening', color: '#d97706' },
  { status: 'Interview', color: '#7c3aed' },
  { status: 'Offer',     color: '#059669' },
  { status: 'Rejected',  color: '#dc2626' },
  { status: 'Ghosted',   color: '#4b5563' },
];

function renderKanban() {
  const board = document.getElementById('kanbanBoard');
  board.innerHTML = '';

  KANBAN_COLUMNS.forEach(({ status, color }) => {
    const apps = allApplications.filter(a => a.status === status);
    const col = document.createElement('div');
    col.className = 'kanban-col';
    col.dataset.status = status;

    col.innerHTML = `
      <div class="kanban-col-header" style="color:${color}">
        ${status}
        <span class="kanban-count">${apps.length}</span>
      </div>
      <div class="kanban-cards" id="kanban-${status}">
        ${apps.map(app => buildKanbanCard(app)).join('')}
      </div>`;

    board.appendChild(col);
  });

  // Drag-and-drop
  setupKanbanDragDrop();
}

function buildKanbanCard(app) {
  const days = getDaysSince(app.dateApplied);
  const followUp = needsFollowUp(app, followUpDays);
  return `
  <div class="kanban-card" draggable="true" data-id="${app.id}"
       role="article" aria-label="${escHTML(app.company)} - ${escHTML(app.role)}">
    <div class="kanban-card-company">${escHTML(app.company)}</div>
    <div class="kanban-card-role">${escHTML(app.role)}</div>
    <div class="kanban-card-meta">
      ${app.source ? `<span class="source-chip">${escHTML(app.source)}</span>` : ''}
      <span>${days}d</span>
      ${app.isReferral ? '<span title="Referral">Referral</span>' : ''}
      ${followUp ? '<span title="Follow up!">Follow up</span>' : ''}
    </div>
  </div>`;
}

function setupKanbanDragDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const cols  = document.querySelectorAll('.kanban-cards');

  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('appId', card.dataset.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  cols.forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.style.background = 'rgba(124,58,237,0.1)';
    });
    col.addEventListener('dragleave', () => {
      col.style.background = '';
    });
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.style.background = '';
      const appId = e.dataTransfer.getData('appId');
      const newStatus = col.closest('.kanban-col').dataset.status;
      await updateApplicationField(appId, { status: newStatus });
      toast(`Moved to "${newStatus}"`, 'success');
      renderKanban();
      applyFiltersAndRender();
      updateStats();
      updateFollowUpBadge();
    });
  });
}

// ──────────────────────────────────────────────
// Timeline rendering
// ──────────────────────────────────────────────

function renderTimeline() {
  const container = document.getElementById('timelineContent');

  if (allApplications.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">0</div><h3>No applications yet</h3></div>';
    return;
  }

  // Group by month
  const byMonth = {};
  [...allApplications]
    .sort((a, b) => new Date(b.dateApplied) - new Date(a.dateApplied))
    .forEach(app => {
      const d = new Date(app.dateApplied);
      const key = d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(app);
    });

  container.innerHTML = Object.entries(byMonth).map(([month, apps]) => `
    <div style="margin-bottom:24px">
      <h3 style="font-size:14px;font-weight:700;color:var(--text-muted);text-transform:uppercase;
                 letter-spacing:0.5px;margin-bottom:12px;padding-bottom:8px;
                 border-bottom:1px solid var(--border)">${month} — ${apps.length} application${apps.length !== 1 ? 's' : ''}</h3>
      ${apps.map(app => {
        const style = getStatusStyle(app.status);
        return `
        <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;
                    margin-bottom:6px;background:var(--bg-card);border:1px solid var(--border);
                    border-radius:var(--radius-sm);cursor:pointer;transition:all 0.18s"
             onclick="openEditModal('${app.id}')"
             onmouseenter="this.style.borderColor='var(--border-accent)'"
             onmouseleave="this.style.borderColor='var(--border)'">
          <div style="font-size:13px;color:var(--text-muted);white-space:nowrap;min-width:48px">
            ${new Date(app.dateApplied).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">
              ${escHTML(app.company)} — ${escHTML(app.role)}
            </div>
            <div style="font-size:13px;color:var(--text-muted);margin-top:1px">
              ${app.source || 'Direct'}${app.isReferral ? ' · Referral' : ''}
            </div>
          </div>
          <span class="status-badge"
                style="background:${style.bg};color:${style.text};border-color:${style.border}">
            ${app.status}
          </span>
        </div>`;
      }).join('')}
    </div>`).join('');
}

// ──────────────────────────────────────────────
// Edit Modal
// ──────────────────────────────────────────────

function setupModals() {
  // Edit modal
  document.getElementById('editModalClose').addEventListener('click', closeEditModal);
  document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
  document.getElementById('editSaveBtn').addEventListener('click', saveEditModal);
  document.getElementById('editModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  // JD modal
  document.getElementById('jdModalClose').addEventListener('click', () =>
    document.getElementById('jdModalOverlay').classList.remove('show'));
  document.getElementById('jdModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget)
      document.getElementById('jdModalOverlay').classList.remove('show');
  });

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeEditModal();
      document.getElementById('jdModalOverlay').classList.remove('show');
    }
  });
}

function openEditModal(id) {
  const app = allApplications.find(a => a.id === id);
  if (!app) return;
  editingAppId = id;

  document.getElementById('edit-company').value      = app.company || '';
  document.getElementById('edit-role').value         = app.role || '';
  document.getElementById('edit-dateApplied').value  = app.dateApplied || '';
  document.getElementById('edit-status').value       = app.status || 'Applied';
  document.getElementById('edit-postingUrl').value   = app.postingUrl || '';
  document.getElementById('edit-recruiterName').value= app.recruiterName || '';
  document.getElementById('edit-salary').value       = app.salary || '';
  document.getElementById('edit-location').value     = app.location || '';
  document.getElementById('edit-referredBy').value   = app.referredBy || '';
  document.getElementById('edit-notes').value        = app.notes || '';

  document.getElementById('editModalTitle').textContent = `Edit: ${app.company}`;
  document.getElementById('editModalOverlay').classList.add('show');
  document.getElementById('edit-company').focus();
}

function closeEditModal() {
  editingAppId = null;
  document.getElementById('editModalOverlay').classList.remove('show');
}

async function saveEditModal() {
  if (!editingAppId) return;

  const company = document.getElementById('edit-company').value.trim();
  const role    = document.getElementById('edit-role').value.trim();
  if (!company || !role) { toast('Company and Role are required', 'error'); return; }

  const updates = {
    company,
    role,
    dateApplied:   document.getElementById('edit-dateApplied').value,
    status:        document.getElementById('edit-status').value,
    postingUrl:    document.getElementById('edit-postingUrl').value.trim(),
    recruiterName: document.getElementById('edit-recruiterName').value.trim(),
    salary:        document.getElementById('edit-salary').value.trim(),
    location:      document.getElementById('edit-location').value.trim(),
    referredBy:    document.getElementById('edit-referredBy').value.trim(),
    isReferral:    !!document.getElementById('edit-referredBy').value.trim(),
    notes:         document.getElementById('edit-notes').value.trim(),
    followUpDate:  getFollowUpDate(document.getElementById('edit-dateApplied').value, followUpDays),
    lastUpdated:   new Date().toISOString(),
  };

  await updateApplicationField(editingAppId, updates);
  closeEditModal();
  toast('Application updated ✓', 'success');
}

function openJDModal(id) {
  const app = allApplications.find(a => a.id === id);
  if (!app) return;
  document.getElementById('jdModalTitle').textContent =
    `Job Description — ${app.company}: ${app.role}`;
  document.getElementById('jdContent').textContent =
    app.jobDescription || 'No job description was saved with this application.';
  document.getElementById('jdModalOverlay').classList.add('show');
}

// ──────────────────────────────────────────────
// CRUD operations
// ──────────────────────────────────────────────

async function updateApplicationField(id, updates) {
  const idx = allApplications.findIndex(a => a.id === id);
  if (idx === -1) return;
  allApplications[idx] = { ...allApplications[idx], ...updates, lastUpdated: new Date().toISOString() };
  await chrome.storage.local.set({ applications: allApplications });
  applyFiltersAndRender();
  updateStats();
  updateFollowUpBadge();
}

async function confirmDelete(id) {
  const app = allApplications.find(a => a.id === id);
  if (!app) return;
  if (!confirm(`Delete application for "${app.role}" at ${app.company}?\n\nThis cannot be undone.`)) return;

  allApplications = allApplications.filter(a => a.id !== id);
  await chrome.storage.local.set({ applications: allApplications });
  toast('Application deleted', 'warning');
}

async function syncAfterChange() {
  try {
    const signedIn = await isGoogleSignedIn().catch(() => false);
    if (signedIn) {
      await syncToGoogleSheets(allApplications);
      await refreshGoogleSheetsStatus().catch(() => {});
    }
  } catch (e) {
    console.warn('HireLog: Sync after change failed', e);
  }
}

// ──────────────────────────────────────────────
// Settings Panel — follow-up days + CSV + clear all
// ──────────────────────────────────────────────

function setupSettingsPanel() {
  // Download CSV (local backup — no sign-in needed)
  document.getElementById('downloadCSVBtn').addEventListener('click', () => {
    downloadCSV(allApplications);
    toast(`Downloaded ${allApplications.length} applications as CSV ✓`, 'success');
  });

  // Follow-up days
  document.querySelectorAll('.days-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      followUpDays = parseInt(btn.dataset.days);
      document.querySelectorAll('.days-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      await chrome.storage.local.set({ hirelog_followup_days: followUpDays });
      updateFollowUpBadge();
      toast(`Follow-up reminder set to ${followUpDays} days ✓`, 'success');
    });
  });

  // Clear all
  document.getElementById('clearAllBtn').addEventListener('click', async () => {
    const count = allApplications.length;
    if (!confirm(`This will permanently delete ALL ${count} tracked applications.\n\nAre you sure? This cannot be undone.`)) return;
    allApplications = [];
    await chrome.storage.local.set({ applications: [] });
    toast(`Cleared ${count} applications`, 'warning');
  });
}

// ──────────────────────────────────────────────
// Google Sheets Section
// ──────────────────────────────────────────────

function setupGoogleSheetsSection() {
  // Sign In
  const signInBtn = document.getElementById('googleSignInBtn');
  signInBtn.addEventListener('click', async () => {
    signInBtn.disabled = true;
    signInBtn.innerHTML = `<span class="spinner" style="border-color:rgba(0,0,0,0.2);border-top-color:#4285f4;width:16px;height:16px"></span> Signing in…`;

    try {
      const user = await googleSignIn();
      toast(`Signed in as ${user.email}`, 'success');
      await refreshGoogleSheetsStatus();
      // Kick off an initial sync automatically
      await triggerGoogleSync(false); // silent mode
    } catch (err) {
      if (err.message === 'SETUP_REQUIRED') {
        document.getElementById('setupRequiredMsg').classList.remove('hidden');
        toast('Google sync is unavailable right now. Local tracking still works.', 'error');
      } else if (err.message === 'CANCELLED') {
        toast('Sign-in cancelled', 'warning');
      } else {
        toast('Sign-in failed: ' + err.message, 'error');
      }
    } finally {
      signInBtn.disabled = false;
      signInBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Sign in with Google`;
    }
  });

  // Sign Out
  document.getElementById('googleSignOutBtn').addEventListener('click', async () => {
    const user = await getGoogleUserInfo();
    const email = user?.email || 'your account';
    if (!confirm(`Sign out of ${email}?\n\nHireLog will stop auto-syncing to Google Sheets until you sign in again.`)) return;
    await googleSignOut();
    await refreshGoogleSheetsStatus();
    toast('Signed out of Google', 'warning');
  });

  // Sync Now
  document.getElementById('syncNowGoogleBtn').addEventListener('click', () => triggerGoogleSync(true));

  // Open Sheet
  document.getElementById('openSheetBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    const url = await getSheetUrl();
    if (url) {
      chrome.tabs.create({ url });
    } else {
      toast('Sheet not created yet — save an application first', 'warning');
    }
  });

  // Disconnect (revoke access + clear sheet ID, keep user logged in locally)
  document.getElementById('googleDisconnectBtn').addEventListener('click', async () => {
    if (!confirm('Disconnect Google Sheets?\n\nThis will sign you out and stop auto-syncing. Your applications stay saved locally.')) return;
    await googleSignOut();
    await refreshGoogleSheetsStatus();
    toast('Disconnected from Google Sheets', 'warning');
  });

  // Initialize UI state
  refreshGoogleSheetsStatus();
}

async function refreshGoogleSheetsStatus() {
  const signedIn = await isGoogleSignedIn().catch(() => false);
  const user     = await getGoogleUserInfo();

  const notSignedInEl = document.getElementById('googleNotSignedIn');
  const signedInEl    = document.getElementById('googleSignedIn');

  if (signedIn && user) {
    notSignedInEl.classList.add('hidden');
    signedInEl.classList.remove('hidden');

    // Update account info
    document.getElementById('googleUserName').textContent  = user.name  || user.email;
    document.getElementById('googleUserEmail').textContent = user.email || '';
    const pic = document.getElementById('googleUserPic');
    if (user.picture) {
      pic.src = user.picture;
      pic.style.display = 'block';
    } else {
      pic.style.display = 'none';
    }

    // Update sheet status
    const { hirelog_sheet_id } = await chrome.storage.local.get('hirelog_sheet_id');
    const lastSync = await getLastSyncTime();

    if (hirelog_sheet_id) {
      document.getElementById('sheetIcon').textContent = 'Sheet';
      document.getElementById('sheetNameDisplay').textContent = 'HireLog — Job Application Tracker';
      document.getElementById('lastSyncDisplay').textContent  =
        lastSync ? `Last synced: ${formatSyncTime(lastSync)}` : 'Connected — sync pending';

      const sheetUrl = await getSheetUrl();
      const openBtn = document.getElementById('openSheetBtn');
      if (sheetUrl) {
        openBtn.href = sheetUrl;
        openBtn.style.opacity = '1';
        openBtn.style.pointerEvents = 'auto';
      }
    } else {
      document.getElementById('sheetIcon').textContent = 'New';
      document.getElementById('sheetNameDisplay').textContent = 'Sheet will be created on first sync';
      document.getElementById('lastSyncDisplay').textContent  = 'Save an application to create the sheet';
      const openBtn = document.getElementById('openSheetBtn');
      openBtn.style.opacity = '0.4';
      openBtn.style.pointerEvents = 'none';
    }
  } else {
    notSignedInEl.classList.remove('hidden');
    signedInEl.classList.add('hidden');
  }
}

async function triggerGoogleSync(showToast = true) {
  const syncBtn = document.getElementById('syncNowGoogleBtn');
  if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = 'Syncing...'; }

  try {
    const result = await syncToGoogleSheets(allApplications);
    if (showToast) toast(`Synced ${result.rowCount} applications to Google Sheets`, 'success');
    await refreshGoogleSheetsStatus();
  } catch (err) {
    console.error('HireLog: Google Sheets sync failed:', err);
    if (showToast) toast(`Sync failed: ${err.message}`, 'error');
  } finally {
    if (syncBtn) { syncBtn.disabled = false; syncBtn.textContent = 'Sync Now'; }
  }
}

// ──────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────

function setupExportButton() {
  document.getElementById('exportBtn').addEventListener('click', () => {
    downloadCSV(allApplications);
    toast(`Downloaded ${allApplications.length} applications as CSV ✓`, 'success');
  });
}

// ──────────────────────────────────────────────
// Tab navigation
// ──────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  currentTab = tabName;

  // Update nav tab buttons
  document.querySelectorAll('.nav-tab').forEach(t => {
    const isActive = t.dataset.tab === tabName;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  });

  // Show/hide content panels
  document.querySelectorAll('.tab-content').forEach(panel => {
    const isActive = panel.id === `tab-content-${tabName}`;
    panel.classList.toggle('active', isActive);
    panel.classList.toggle('hidden', !isActive);
  });

  // Render tab-specific content
  if (tabName === 'kanban')   renderKanban();
  if (tabName === 'timeline') renderTimeline();
  if (tabName === 'settings') {
    try { refreshGoogleSheetsStatus(); } catch (_) {}
  }
}

// ──────────────────────────────────────────────
// URL hash routing (e.g., #settings, #welcome)
// ──────────────────────────────────────────────

function checkUrlHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'settings') switchTab('settings');
  else if (hash === 'welcome') {
    // First install — show a welcome toast
    toast('Welcome to HireLog. Click the extension icon on any job posting to start tracking.', 'success');
  }
  // Clear hash
  history.replaceState(null, '', window.location.pathname);
}

// ──────────────────────────────────────────────
// Toast notifications
// ──────────────────────────────────────────────

function toast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 350);
  }, 3000);
}

// ──────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────

function escHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function encodeURIAsHref(url) {
  try { return new URL(url).href; }
  catch { return '#'; }
}
