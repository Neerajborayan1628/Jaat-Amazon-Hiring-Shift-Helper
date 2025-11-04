// Background service worker (MV3)
// Responsibilities:
// - Manage Start/Stop state and refresh interval via chrome.storage
// - Use chrome.alarms to trigger periodic refresh on matching tabs
// - Relay status updates to popup and content scripts
// - Auto-open/apply actions are performed in content.js; background triggers reloads

const DEFAULT_INTERVAL_SEC = 10;
const STATE_KEY = 'shiftHelperState';
const OFFSCREEN_URL = chrome.runtime.getURL('offscreen.html');
let detectedCount = 0;
let resumeTimer = null;

/**
 * Get current state from storage
 * { running: boolean, intervalSec: number, lastStatus: string }
 */
async function getState() {
  const data = await chrome.storage.local.get({ [STATE_KEY]: { running: false, intervalSec: DEFAULT_INTERVAL_SEC, lastStatus: 'Stopped' } });
  return data[STATE_KEY];
}

async function setState(partial) {
  const current = await getState();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

function alarmName() {
  return 'shift-helper-refresh';
}

async function createOrUpdateAlarm(intervalSec) {
  const safeSec = Math.max(intervalSec, 60); // alarms only support >=60s reliably
  const periodInMinutes = safeSec / 60; // chrome.alarms uses minutes
  await chrome.alarms.clear(alarmName());
  await chrome.alarms.create(alarmName(), { periodInMinutes });
}

async function clearAlarm() {
  await chrome.alarms.clear(alarmName());
}

async function refreshEligibleTabs() {
  const tabs = await chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] });
  for (const tab of tabs) {
    if (tab.id) {
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'PERFORM_REFRESH' }).catch(() => {});
      } catch (_) {}
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await setState({ running: false, intervalSec: DEFAULT_INTERVAL_SEC, lastStatus: 'Stopped' });
  await clearAlarm();
  // Re-inject content into existing matching tabs (fixes "Receiving end does not exist")
  try {
    const tabs = await chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] });
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        } catch (_) {}
      }
    }
  } catch (_) {}
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await getState();
  if (state.running) {
    await createOrUpdateAlarm(state.intervalSec ?? DEFAULT_INTERVAL_SEC);
    try {
      const tabs = await chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] });
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: 'KICK' }).catch(() => {});
        }
      }
    } catch (_) {}
  } else {
    await clearAlarm();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== alarmName()) return;
  const state = await getState();
  if (!state.running) return;
  await refreshEligibleTabs();
});

// Message handling from popup/content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'GET_STATE') {
      const state = await getState();
      sendResponse({ ok: true, state });
      return;
    }

    if (message?.type === 'START') {
      const intervalSec = Math.max(Number(message.intervalSec) || DEFAULT_INTERVAL_SEC, 1);
      const next = await setState({ running: true, intervalSec, lastStatus: 'Running' });
      if (intervalSec >= 60) {
        await createOrUpdateAlarm(intervalSec);
      } else {
        await clearAlarm();
      }
      try {
        const tabs = await chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] });
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'KICK' }).catch(() => {});
          }
        }
      } catch (_) {}
      sendResponse({ ok: true, state: next });
      return;
    }

    if (message?.type === 'STOP') {
      const next = await setState({ running: false, lastStatus: 'Stopped' });
      await clearAlarm();
      sendResponse({ ok: true, state: next });
      return;
    }

    if (message?.type === 'SET_STATUS') {
      const next = await setState({ lastStatus: message.status || 'Running' });
      sendResponse({ ok: true, state: next });
      return;
    }

    if (message?.type === 'PLAY_SOUND') {
      await ensureOffscreen();
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_PLAY', sound: message.sound || 'chime' });
      sendResponse({ ok: true });
      return;
    }
  if (message?.type === 'JOB_DETECTED') {
      detectedCount += 1;
      updateBadge();
      await notifyJobDetected(message.text);
      sendResponse({ ok: true });
      return;
  }
    // Block any unexpected navigations to facebook (some pages open tracking links)
    if (message?.type === 'BLOCK_FACEBOOK') {
      try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id && tab.url && /facebook\.com/i.test(tab.url)) {
            await chrome.tabs.remove(tab.id);
          }
        }
      } catch (_) {}
      sendResponse({ ok: true });
      return;
    }
  })();
  return true; // keep message channel open for async sendResponse
});

async function hasOffscreen() {
  const clients = await chrome.offscreen.hasDocument?.();
  return Boolean(clients);
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play notification sound when new jobs are detected.'
    });
  } catch (_) {}
}

// Badge helpers
function updateBadge() {
  const text = detectedCount > 0 ? String(detectedCount) : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
}

// Notifications
async function notifyJobDetected(jobText) {
  try {
    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.svg',
      title: 'Job detected',
      message: jobText?.slice(0, 90) || 'A new job was detected.',
      buttons: [{ title: 'Open job' }],
      priority: 1
    });
  } catch (_) {}
}

chrome.notifications.onButtonClicked.addListener((id, btnIdx) => {
  if (btnIdx === 0) {
    // Focus the first matching tab
    chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] }).then((tabs) => {
      if (tabs[0]?.id) chrome.tabs.update(tabs[0].id, { active: true });
    });
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === 'toggle-activate') {
    const s = await getState();
    if (s.running) {
      await setState({ running: false, lastStatus: 'Stopped' });
      await clearAlarm();
    } else {
      await setState({ running: true, lastStatus: 'Running' });
      if ((s.intervalSec || DEFAULT_INTERVAL_SEC) >= 60) await createOrUpdateAlarm(s.intervalSec);
      const tabs = await chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] });
      for (const tab of tabs) { if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'KICK' }).catch(() => {}); }
    }
  }
  if (cmd === 'test-sound') {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_PLAY', sound: 'chime' });
  }
  if (cmd === 'toggle-theme') {
    const cur = (await chrome.storage.local.get('uiTheme'))['uiTheme'] || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    await chrome.storage.local.set({ uiTheme: next });
  }
});

// Auto-resume after paused-on-success
async function scheduleAutoResume(minutes) {
  clearTimeout(resumeTimer);
  if (!minutes || minutes <= 0) return;
  resumeTimer = setTimeout(async () => {
    const st = await getState();
    if (!st.running) {
      await setState({ running: true, lastStatus: 'Running' });
      const tabs = await chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] });
      for (const tab of tabs) { if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'KICK' }).catch(() => {}); }
    }
  }, minutes * 60 * 1000);
}



