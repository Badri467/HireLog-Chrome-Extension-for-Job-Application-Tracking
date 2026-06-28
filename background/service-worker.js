// background/service-worker.js — HireLog MV3 Service Worker
// Handles: follow-up alarms, badge management, notification routing

importScripts('/utils/helpers.js');

const ALARM_DAILY = 'hirelog_daily_followup_check';
const FOLLOW_UP_DAYS_DEFAULT = 7;

// ──────────────────────────────────────────────
// Install / Update
// ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  // Set up recurring daily alarm for follow-up checks
  chrome.alarms.create(ALARM_DAILY, {
    delayInMinutes: 1,          // first check after 1 minute
    periodInMinutes: 60 * 24,   // then every 24 hours
  });

  if (reason === 'install') {
    // Open dashboard on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard/dashboard.html') + '#welcome'
    });
  }
});

// ──────────────────────────────────────────────
// Alarm handler — daily follow-up checks
// ──────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_DAILY) {
    await checkFollowUps();
  }
});

async function checkFollowUps() {
  const { applications = [], hirelog_followup_days = FOLLOW_UP_DAYS_DEFAULT } =
    await chrome.storage.local.get(['applications', 'hirelog_followup_days']);

  const today = getTodayISO();
  const overdue = applications.filter(app => {
    if (app.status !== 'Applied') return false;
    const followUp = app.followUpDate || getFollowUpDate(app.dateApplied, hirelog_followup_days);
    return followUp <= today;
  });

  if (overdue.length === 0) return;

  // Get the IDs we've already notified so we don't spam
  const { notified_ids = [] } = await chrome.storage.local.get('notified_ids');

  for (const app of overdue) {
    if (notified_ids.includes(app.id)) continue;

    const daysSince = getDaysSince(app.dateApplied);
    chrome.notifications.create(`followup_${app.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: '⏰ HireLog: Follow-up Reminder',
      message: `${daysSince} days since you applied to "${app.role}" at ${app.company}. Time to follow up!`,
      buttons: [
        { title: '📊 Open Dashboard' },
        { title: '✓ Dismiss' }
      ],
      requireInteraction: true,
      priority: 1,
    });

    notified_ids.push(app.id);
  }

  // Store updated notified list (cap at 500 to avoid bloat)
  const trimmed = notified_ids.slice(-500);
  await chrome.storage.local.set({ notified_ids: trimmed });
}

// ──────────────────────────────────────────────
// Notification button clicks
// ──────────────────────────────────────────────

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  chrome.notifications.clear(notificationId);
  if (buttonIndex === 0) {
    // Open dashboard
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard/dashboard.html')
    });
  }
  // buttonIndex === 1: Dismiss — nothing extra needed
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
  chrome.tabs.create({
    url: chrome.runtime.getURL('dashboard/dashboard.html')
  });
});

// ──────────────────────────────────────────────
// Message routing from popup / content scripts
// ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {

    case 'openDashboard':
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
      sendResponse({ ok: true });
      break;

    case 'setJobBadge':
      if (sender.tab?.id) {
        chrome.action.setBadgeText({ text: '●', tabId: sender.tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId: sender.tab.id });
        chrome.action.setTitle({ title: 'HireLog — Job detected! Click to log.', tabId: sender.tab.id });
      }
      sendResponse({ ok: true });
      break;

    case 'clearBadge':
      if (sender.tab?.id) {
        chrome.action.setBadgeText({ text: '', tabId: sender.tab.id });
        chrome.action.setTitle({ title: 'HireLog — Track this job', tabId: sender.tab.id });
      }
      sendResponse({ ok: true });
      break;

    case 'getFollowUpCount':
      chrome.storage.local.get(['applications', 'hirelog_followup_days']).then(
        ({ applications = [], hirelog_followup_days = FOLLOW_UP_DAYS_DEFAULT }) => {
          const today = getTodayISO();
          const count = applications.filter(app => {
            if (app.status !== 'Applied') return false;
            const fu = app.followUpDate || getFollowUpDate(app.dateApplied, hirelog_followup_days);
            return fu <= today;
          }).length;
          sendResponse({ count });
        }
      );
      return true; // async response



    default:
      sendResponse({ ok: false, error: 'Unknown action' });
      break;
  }

  return true;
});


