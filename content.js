// Content script: robust job workflow automation for hiring.amazon.ca
// - Listings page: detect jobs and click one (or iterate)
// - Details page: click Apply
// - Application page: click Create Application
// - Random human-like delays and continuous monitoring
// - Logs each step and reports status to background; optional on-page toast

const BUTTON_TEXT_PATTERNS = [
  'create application',
  'apply',
  'accept',
  'claim',
  'book shift',
  'book',
  'select',
  'sign up',
  'submit',
  'continue',
  'next',
  'confirm',
  'proceed'
];

function normalize(text) { return (text || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  const style = getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
  const rects = element.getClientRects();
  return rects.length > 0 && rects[0].width > 0 && rects[0].height > 0;
}

function isDisabled(element) {
  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

function isButtonLike(element) {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  if (tag === 'button') return true;
  if (tag === 'a' && (element.getAttribute('href') || role === 'button')) return true;
  if (role === 'button') return true;
  if (tag === 'input') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (['button', 'submit'].includes(type)) return true;
  }
  return false;
}

function elementMatchesPatterns(element) {
  const labels = [
    element.innerText,
    element.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('value'),
    element.getAttribute('data-testid'),
    element.getAttribute('data-test'),
    element.getAttribute('data-automation-id')
  ].filter(Boolean).map(normalize);
  const combined = normalize(labels.join(' '));
  return BUTTON_TEXT_PATTERNS.some(p => combined.includes(p));
}

function deepQueryAll(selector, root = document) {
  const results = [];
  const traverse = (node) => {
    if (!node) return;
    if (node instanceof Element || node instanceof Document || node instanceof DocumentFragment) {
      try { results.push(...node.querySelectorAll(selector)); } catch (_) {}
      const children = node.shadowRoot ? [node.shadowRoot] : [];
      for (const child of children) traverse(child);
      for (const n of node.children || []) traverse(n);
    }
  };
  traverse(root);
  return Array.from(new Set(results));
}

function findClickableButtonsDeep(root = document) {
  const nodes = deepQueryAll('button, a, [role="button"], input[type="button"], input[type="submit"]', root);
  return nodes.filter((el) => el instanceof HTMLElement && isButtonLike(el) && !isDisabled(el) && elementMatchesPatterns(el));
}

// -------------------- Utilities --------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomBetween(minMs, maxMs) { return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs; }
async function randomHumanDelay() { await sleep(randomBetween(1000, 3000)); }

let toastEl = null;
function showToast(message, kind = 'info') {
  try {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.position = 'fixed';
      toastEl.style.zIndex = '2147483647';
      toastEl.style.bottom = '16px';
      toastEl.style.right = '16px';
      toastEl.style.maxWidth = '300px';
      toastEl.style.padding = '10px 12px';
      toastEl.style.borderRadius = '8px';
      toastEl.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
      toastEl.style.fontSize = '13px';
      toastEl.style.boxShadow = '0 4px 16px rgba(0,0,0,0.25)';
      toastEl.style.color = '#fff';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.style.background = kind === 'success' ? '#16a34a' : kind === 'warn' ? '#f59e0b' : '#111827';
    toastEl.textContent = message;
    toastEl.style.display = 'block';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => { if (toastEl) toastEl.style.display = 'none'; }, 2500);
  } catch (_) {}
}

async function setStatus(status) {
  try { await chrome.runtime.sendMessage({ type: 'SET_STATUS', status }); } catch (_) {}
}

async function getRunningState() {
  try {
    const { shiftHelperState } = await chrome.storage.local.get('shiftHelperState');
    return Boolean(shiftHelperState?.running);
  } catch { return true; }
}

let lastAttemptTs = 0;
let lastToastTs = 0;
const TOAST_COOLDOWN_MS = 10000;
let refreshTimer = null;
let currentIntervalSec = 10;
let softRefreshCount = 0;

async function attemptClick() {
  const now = Date.now();
  if (now - lastAttemptTs < 500) return false; // debounce
  lastAttemptTs = now;

  const isRunning = await getRunningState();
  if (!isRunning) return false;

  try {
    const buttons = findClickableButtonsDeep();
    if (buttons.length > 0) {
      const visible = buttons.find(isVisible) || buttons[0];
      // Try robust click sequence without scrolling
      try {
        visible.click();
        visible.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch (_) {}
      showToast('Shift Helper: clicked an action button', 'success');
      await setStatus('Success: Clicked action');
      // Prevent trackers from opening Facebook by asking background to close any such tabs
      try { await chrome.runtime.sendMessage({ type: 'BLOCK_FACEBOOK' }); } catch (_) {}
      return true;
    }
    if (now - lastToastTs > TOAST_COOLDOWN_MS) {
      showToast('Shift Helper: No shifts available, retrying…', 'warn');
      lastToastTs = now;
    }
    await setStatus('Retrying: No shifts available');
    return false;
  } catch (e) {
    await setStatus('Error during click');
    return false;
  }
}

// Observe DOM changes (including SPA route changes)
const observer = new MutationObserver(() => { attemptClick(); });
observer.observe(document.documentElement || document.body, { subtree: true, childList: true, attributes: true });

// Polling as fallback (some frameworks batch DOM updates)
setInterval(() => { attemptClick(); }, 1500);

// Run on load and on hashroute changes
document.addEventListener('DOMContentLoaded', attemptClick);
window.addEventListener('load', attemptClick);
window.addEventListener('hashchange', attemptClick);

// Listen for manual refresh signal
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'REFRESH_TRIGGERED') {
    setTimeout(attemptClick, 500);
  }
  if (msg?.type === 'KICK') {
    // Immediate workflow kick-off on activation
    setTimeout(() => {
      attemptClick();
      workflowLoop();
      setupRefreshLoop();
    }, 200);
  }
  if (msg?.type === 'PERFORM_REFRESH') {
    // SPA-friendly refresh: navigate to jobSearch route if not there, else soft reload
    const target = 'https://hiring.amazon.ca/app#/jobSearch';
    const now = Date.now();
    if (!onListingsPage()) {
      console.log('[ShiftHelper] PERFORM_REFRESH -> navigate to jobSearch');
      window.location.href = target;
      return;
    }
    // Debounce excessive reloads
    if (!window.__lastSoftRefreshTs || now - window.__lastSoftRefreshTs > 8000) {
      window.__lastSoftRefreshTs = now;
      // Force scroll to top BEFORE any refresh operations
      window.scrollTo({ top: 0, behavior: 'instant' });
      // Trigger framework data refresh via hash toggle and timestamp param
      const dummy = 'https://hiring.amazon.ca/app#/__ping';
      console.log('[ShiftHelper] Soft refresh via hash toggle');
      history.replaceState({}, '', dummy);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      const tsUrl = 'https://hiring.amazon.ca/app#/jobSearch?ts=' + Date.now();
      history.replaceState({}, '', tsUrl);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      softRefreshCount++;
      if (softRefreshCount % 5 === 0) {
        console.log('[ShiftHelper] Hard reload fallback');
        window.__didHardReloadOnce = false; // allow watchdog
        location.reload();
        return;
      }
      setTimeout(() => { 
        // Ensure we're at top after refresh
        window.scrollTo({ top: 0, behavior: 'instant' });
        attemptClick(); 
        workflowLoop(); 
      }, 800);
      // Watchdog: if page content area is blank > 5s, force hard reload once
      setTimeout(() => {
        const blank = document.body && document.body.innerText.trim().length < 5;
        if (blank && !window.__didHardReloadOnce) {
          window.__didHardReloadOnce = true;
          console.log('[ShiftHelper] Watchdog hard reload');
          location.reload();
        }
      }, 5000);
    }
  }
  if (msg?.type === 'TEST_DETECT') {
    const links = findJobLinks();
    const first = links[0];
    if (first) {
      first.style.outline = '3px solid #22c55e';
      first.style.transition = 'outline 0.2s ease';
      showToast('First job highlighted (test mode)', 'success');
    } else {
      showToast('No jobs detected to highlight', 'warn');
    }
  }
});

// -------------------- Job Workflow State Machine --------------------
const STATE = {
  IDLE: 'IDLE',
  ON_LISTINGS: 'ON_LISTINGS',
  ON_DETAILS: 'ON_DETAILS',
  ON_APPLICATION: 'ON_APPLICATION'
};

function onListingsPage() {
  const url = location.href;
  // Support both hash and path variants
  return /#\/jobSearch/i.test(url) || /\/jobSearch/i.test(url) || /job search/i.test(document.title);
}

function onDetailsPage() {
  const url = location.href;
  return /#\/job/gi.test(url) && !/#\/jobSearch/i.test(url);
}

function onApplicationPage() {
  // Heuristic: Create Application/Continue buttons visible
  const btns = findClickableButtonsDeep();
  return btns.some(b => /create application|continue|submit/i.test(b.textContent || ''));
}

function findJobLinks() {
  // Look for job listings in various formats (dropdown items, list items, cards, etc.)
  const selectors = [
    'a[href*="job"]', 'a[href*="position"]', 'a[href*="career"]',
    '[data-testid*="job"]', '[data-test*="job"]', '[data-testid*="position"]',
    '.job-item', '.job-card', '.job-listing', '.position-item',
    'li[class*="job"]', 'div[class*="job"]', 'tr[class*="job"]',
    'button[class*="job"]', '[role="button"][class*="job"]'
  ];
  
  const allClickable = deepQueryAll(selectors.join(', '));
  const candidates = allClickable.filter(el => {
    const href = el.getAttribute('href') || '';
    const text = normalize(el.textContent || '');
    const dataTest = el.getAttribute('data-testid') || el.getAttribute('data-test') || '';
    const className = el.className || '';
    
    // Check if it looks like a job listing (more comprehensive patterns)
    const looksLikeJob = 
      /#\/job/i.test(href) || 
      /job\b/i.test(text) || 
      /position\b/i.test(text) ||
      /career\b/i.test(text) ||
      /view\s+job/i.test(text) || 
      /see\s+details/i.test(text) ||
      /apply\s+now/i.test(text) ||
      /job/i.test(dataTest) ||
      /job/i.test(className) ||
      // Pattern for dropdown/list items with dates and IDs like "Department Name - Date (#ID)"
      (/\w+\s+-\s+\d{2}\/\d{2}\/\d{4}\s+\(#\d+\)/i.test(text)) ||
      // Pattern for job titles with locations
      (text.length > 10 && text.length < 200 && 
       !/login|sign|menu|nav|header|footer|sidebar/i.test(text) &&
       (/\b(shift|warehouse|fulfillment|delivery|driver|associate|specialist|coordinator|manager|supervisor)\b/i.test(text) ||
        /\b(am|pm|morning|afternoon|evening|night|weekend|part.?time|full.?time)\b/i.test(text)));
    
    return looksLikeJob && isVisible(el);
  });
  
  // De-duplicate and prioritize
  const unique = [];
  const seen = new Set();
  for (const el of candidates) {
    const key = el.getAttribute('href') || el.textContent?.trim() || el.getAttribute('data-testid') || '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(el);
  }
  
  console.log('[ShiftHelper] Found job links:', unique.length, unique.map(a => a.textContent?.trim().substring(0, 50)));
  return unique;
}

function computeJobScore(text, prefs) {
  let score = 0;
  const t = normalize(text);
  const includes = (prefs?.includeKw || []).map(normalize);
  const excludes = (prefs?.excludeKw || []).map(normalize);
  for (const kw of includes) { if (kw && t.includes(kw)) score += 10; }
  for (const kw of excludes) { if (kw && t.includes(kw)) score -= 20; }
  // Small bonus for common job keywords
  if (/night|evening|weekend|full.?time/i.test(text)) score += 3;
  return score;
}

async function clickFirstJobLink() {
  const links = findJobLinks();
  if (links.length === 0) {
    console.log('[ShiftHelper] No job links found');
    return false;
  }
  // Smart targeting: pick highest score
  let prefs = {};
  try { const st = await chrome.storage.local.get('schedulerPrefs'); prefs = st?.schedulerPrefs || {}; } catch (_) {}
  const scored = links.map(el => ({ el, score: computeJobScore(el.textContent || '', prefs) }));
  scored.sort((a,b) => b.score - a.score);
  const chosen = (scored[0]?.el) || links[0];
  try {
    const prefs = await chrome.storage.local.get('schedulerPrefs');
    const sound = prefs?.schedulerPrefs?.sound || 'chime';
    if (sound !== 'off') {
      await chrome.runtime.sendMessage({ type: 'PLAY_SOUND', sound });
    }
    // Update badge and push desktop notification
    const text = (chosen.textContent || '').trim().slice(0, 90);
    await chrome.runtime.sendMessage({ type: 'SET_STATUS', status: 'Detected job' });
    chrome.runtime.sendMessage({ type: 'JOB_DETECTED', text }).catch(() => {});
    // Log action
    const entry = { ts: Date.now(), msg: 'Detected job: ' + text };
    const cur = await chrome.storage.local.get('actionLog');
    const list = (cur.actionLog || []).concat([entry]).slice(-100);
    await chrome.storage.local.set({ actionLog: list });
  } catch (_) {}
  const first = chosen;
  console.log('[ShiftHelper] Job clicked:', first.getAttribute('href'), first.textContent?.trim());
  await randomHumanDelay();
  try {
    first.click();
    console.log('[ShiftHelper] Job click successful');
    const entry = { ts: Date.now(), msg: 'Clicked job' };
    const cur2 = await chrome.storage.local.get('actionLog');
    const list2 = (cur2.actionLog || []).concat([entry]).slice(-100);
    await chrome.storage.local.set({ actionLog: list2 });
  } catch (e) {
    console.log('[ShiftHelper] Job click failed:', e);
    const entry = { ts: Date.now(), msg: 'Job click failed' };
    const cur3 = await chrome.storage.local.get('actionLog');
    const list3 = (cur3.actionLog || []).concat([entry]).slice(-100);
    await chrome.storage.local.set({ actionLog: list3 });
  }
  return true;
}

async function clickApplyButton() {
  const applyButtons = findClickableButtonsDeep().filter(b => /apply/i.test(b.textContent || '') && isVisible(b));
  if (applyButtons.length === 0) return false;
  const btn = applyButtons[0];
  console.log('[ShiftHelper] Apply clicked');
  await randomHumanDelay();
  btn.click();
  return true;
}

async function clickCreateApplicationButton() {
  const buttons = findClickableButtonsDeep().filter(b => /create application|continue|submit/i.test(b.textContent || '') && isVisible(b));
  if (buttons.length === 0) return false;
  const btn = buttons[0];
  console.log('[ShiftHelper] Create Application clicked');
  await randomHumanDelay();
  btn.click();
  return true;
}

async function workflowLoop() {
  if (!(await getRunningState())) { return; }
  try {
    if (onListingsPage()) {
      console.log('[ShiftHelper] On listings page, looking for jobs...');
      const clicked = await clickFirstJobLink();
      if (clicked) {
        console.log('[ShiftHelper] Successfully clicked a job!');
        return;
      } else {
        console.log('[ShiftHelper] No jobs found, waiting for refresh...');
        await setStatus('Retrying: No jobs available');
        showToast('No jobs available, retrying…', 'warn');
        return;
      }
    }

    if (onDetailsPage()) {
      const done = await clickApplyButton();
      if (!done) {
        console.log('[ShiftHelper] Apply not found yet, waiting...');
      }
      return;
    }

    if (onApplicationPage()) {
      const done = await clickCreateApplicationButton();
      if (done) {
        console.log('[ShiftHelper] Application step performed.');
        await setStatus('Success: Application progressed');
        // After attempt, go back to listings to continue monitoring
        await sleep(2500);
        window.location.href = 'https://hiring.amazon.ca/app#/jobSearch';
      }
      return;
    }
  } catch (e) {
    console.log('[ShiftHelper] Error in workflow loop', e);
  }
}

// Main monitor ticker - check for jobs more frequently
setInterval(workflowLoop, 1000);

function setupRefreshLoop() {
  clearInterval(refreshTimer);
  refreshTimer = null;
  chrome.storage.local.get('shiftHelperState').then(({ shiftHelperState }) => {
    currentIntervalSec = Math.max(Number(shiftHelperState?.intervalSec) || 10, 2);
    if (shiftHelperState?.running) {
      refreshTimer = setInterval(() => {
        // mimic background PERFORM_REFRESH for <60s intervals
        const target = 'https://hiring.amazon.ca/app#/jobSearch';
        const dummy = 'https://hiring.amazon.ca/app#/__ping';
        console.log('[ShiftHelper] Tick refresh', new Date().toLocaleTimeString());
        if (!onListingsPage()) {
          window.location.href = target;
        } else {
          history.replaceState({}, '', dummy);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
          const tsUrl = 'https://hiring.amazon.ca/app#/jobSearch?ts=' + Date.now();
          history.replaceState({}, '', tsUrl);
          window.dispatchEvent(new HashChangeEvent('hashchange'));
          softRefreshCount++;
          if (softRefreshCount % 5 === 0) {
            console.log('[ShiftHelper] Hard reload fallback (ticker)');
            window.__didHardReloadOnce = false;
            location.reload();
            return;
          }
        }
        setTimeout(() => { 
          // Force scroll to top after refresh to ensure we see job listings
          window.scrollTo({ top: 0, behavior: 'instant' });
          attemptClick(); 
          workflowLoop(); 
        }, 600);
      }, Math.max(currentIntervalSec * 1000, 2000));
    }
  }).catch(() => {});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes['shiftHelperState']?.newValue) {
    setupRefreshLoop();
  }
});

// Initialize loop on first load
setupRefreshLoop();


