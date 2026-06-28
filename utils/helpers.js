// utils/helpers.js — Shared utilities for HireLog extension

// ──────────────────────────────────────────────
// ID & Date utilities
// ──────────────────────────────────────────────

function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function getDaysSince(isoString) {
  if (!isoString) return 0;
  const diff = Date.now() - new Date(isoString).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getFollowUpDate(appliedDateISO, days = 7) {
  const date = new Date(appliedDateISO);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// ──────────────────────────────────────────────
// Portal detection — 50+ platforms
// ──────────────────────────────────────────────

const PORTAL_MAP = {
  // Global job boards
  'linkedin.com':        'LinkedIn',
  'indeed.com':          'Indeed',
  'glassdoor.com':       'Glassdoor',
  'monster.com':         'Monster',
  'ziprecruiter.com':    'ZipRecruiter',
  'careerbuilder.com':   'CareerBuilder',
  'simplyhired.com':     'SimplyHired',
  'dice.com':            'Dice',
  'builtin.com':         'Built In',
  'wellfound.com':       'Wellfound',
  'angel.co':            'AngelList',
  // Indian portals
  'naukri.com':          'Naukri',
  'shine.com':           'Shine',
  'internshala.com':     'Internshala',
  'instahyre.com':       'Instahyre',
  'cutshort.io':         'Cutshort',
  'foundit.in':          'Foundit',
  'iimjobs.com':         'IIMJobs',
  'freshersworld.com':   'FreshersWorld',
  'hirist.com':          'Hirist',
  'apna.co':             'Apna',
  'updazz.com':          'Updazz',
  'timesjobs.com':       'TimesJobs',
  // ATS platforms
  'greenhouse.io':       'Greenhouse',
  'boards.greenhouse.io':'Greenhouse',
  'lever.co':            'Lever',
  'jobs.lever.co':       'Lever',
  'myworkdayjobs.com':   'Workday',
  'workday.com':         'Workday',
  'taleo.net':           'Taleo',
  'icims.com':           'iCIMS',
  'smartrecruiters.com': 'SmartRecruiters',
  'jobvite.com':         'Jobvite',
  'breezy.hr':           'Breezy',
  'bamboohr.com':        'BambooHR',
  'ashbyhq.com':         'Ashby',
  'rippling.com':        'Rippling',
  'workable.com':        'Workable',
  'recruitee.com':       'Recruitee',
  'personio.com':        'Personio',
  'pinpointhq.com':      'Pinpoint',
  'teamtailor.com':      'Teamtailor',
  'apply.workable.com':  'Workable',
  // International
  'seek.com.au':         'Seek',
  'seek.com':            'Seek',
  'jobstreet.com':       'JobStreet',
  'reed.co.uk':          'Reed',
  'totaljobs.com':       'TotalJobs',
  'cwjobs.co.uk':        'CWJobs',
  'stepstone.de':        'StepStone',
  'xing.com':            'Xing',
  'jobs.ch':             'Jobs.ch',
  'jobup.ch':            'JobUp',
  // Tech-specific
  'stackoverflow.com':   'Stack Overflow',
  'remoteok.com':        'Remote OK',
  'weworkremotely.com':  'We Work Remotely',
  'remote.co':           'Remote.co',
  'ycombinator.com':     'Y Combinator',
  'toptal.com':          'Toptal',
  'hired.com':           'Hired',
  'triplebyte.com':      'Triplebyte',
  'hackerrank.com':      'HackerRank',
};

function detectPortal(url) {
  if (!url) return 'Manual';
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const [domain, name] of Object.entries(PORTAL_MAP)) {
      if (hostname.includes(domain) || domain.includes(hostname)) return name;
    }
    // Generic detection
    if (hostname.includes('job') || hostname.includes('career') || hostname.includes('recruit')) {
      return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
    }
  } catch (e) {}
  return 'Other';
}

// ──────────────────────────────────────────────
// Status helpers
// ──────────────────────────────────────────────

const STATUS_COLORS = {
  'In Progress': { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  'Applied':   { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  'Screening': { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  'Interview': { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  'Offer':     { bg: '#ecfdf5', text: '#047857', border: '#bbf7d0' },
  'Rejected':  { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  'Ghosted':   { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  'Withdrawn': { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
};

const ALL_STATUSES = ['In Progress', 'Applied', 'Screening', 'Interview', 'Offer', 'Rejected', 'Ghosted', 'Withdrawn'];

function getStatusStyle(status) {
  return STATUS_COLORS[status] || STATUS_COLORS['Applied'];
}

// ──────────────────────────────────────────────
// CSV generation (Excel-compatible)
// ──────────────────────────────────────────────

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/\r\n/g, ' ').replace(/\n/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes("'")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function generateCSV(applications) {
  const headers = [
    'Company', 'Role', 'Status', 'Date Applied', 'Source / Portal',
    'Is Referral', 'Referred By', 'Recruiter Name', 'Location',
    'Salary', 'Follow-up Date', 'Days Since Applied',
    'Notes', 'Job Posting URL', 'Job Description (Snapshot)', 'Last Updated'
  ];

  const rows = applications.map(app => [
    escapeCSV(app.company),
    escapeCSV(app.role),
    escapeCSV(app.status),
    escapeCSV(app.dateApplied),
    escapeCSV(app.source),
    escapeCSV(app.isReferral ? 'Yes' : 'No'),
    escapeCSV(app.referredBy),
    escapeCSV(app.recruiterName),
    escapeCSV(app.location),
    escapeCSV(app.salary),
    escapeCSV(app.followUpDate),
    escapeCSV(getDaysSince(app.dateApplied)),
    escapeCSV(app.notes),
    escapeCSV(app.postingUrl),
    escapeCSV(app.jobDescription ? app.jobDescription.substring(0, 500) : ''),
    escapeCSV(app.lastUpdated),
  ]);

  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  // \uFEFF = UTF-8 BOM so Excel opens it with correct encoding
}

// ──────────────────────────────────────────────
// Stats computation
// ──────────────────────────────────────────────

function computeStats(applications) {
  const total = applications.length;
  const inProgress = applications.filter(a => a.status === 'In Progress').length;
  const applied = applications.filter(a => a.status === 'Applied').length;
  const offers = applications.filter(a => a.status === 'Offer').length;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const thisWeek = applications.filter(a =>
    new Date(a.dateApplied) >= oneWeekAgo
  ).length;

  return { total, inProgress, applied, offers, thisWeek };
}

function needsFollowUp(app, followUpDays = 7) {
  if (app.status !== 'Applied') return false;
  return getDaysSince(app.dateApplied) >= followUpDays;
}
