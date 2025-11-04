const intervalInput = document.getElementById('interval');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const activateButton = document.getElementById('activateButton');
const alertBox = document.getElementById('alert');
const themeToggle = document.getElementById('themeToggle');
const soundSelect = document.getElementById('soundSelect');
const pauseOnSuccessBtn = document.getElementById('pauseOnSuccess');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');
const testSound = document.getElementById('testSound');
const uploadSound = document.getElementById('uploadSound');
const customSoundFile = document.getElementById('customSoundFile');
const testDetect = document.getElementById('testDetect');
const volumeRange = document.getElementById('volumeRange');
const repeatToggle = document.getElementById('repeatToggle');
const includeKw = document.getElementById('includeKw');
const excludeKw = document.getElementById('excludeKw');
const actionLog = document.getElementById('actionLog');
const citySelect = document.getElementById('citySelect');
const distanceKm = document.getElementById('distanceKm');
const workHours = document.getElementById('workHours');
const cityChips = document.getElementById('cityChips');
const cityInput = document.getElementById('cityInput');
const clearCities = document.getElementById('clearCities');
const resetBtn = document.getElementById('resetBtn');
const contactBtn = document.getElementById('contactBtn');

const STORAGE_KEY = 'schedulerPrefs';
const THEME_KEY = 'uiTheme';
const CANADA_CITIES = [
  'Toronto','Montreal','Vancouver','Calgary','Edmonton','Ottawa','Winnipeg','Quebec City','Hamilton','Kitchener','London','Victoria','Halifax','Oshawa','Windsor','Saskatoon','Regina','Sherbrooke','St. John\'s','Barrie','Kelowna','Abbotsford','Sudbury','Kingston','Saguenay','Trois-Rivières','Guelph','Moncton','Brantford','Saint John','Thunder Bay','Peterborough','Red Deer','Lethbridge','Kamloops','Nanaimo','Chatham-Kent','Fredericton','Medicine Hat','Prince George','Drummondville','Saint-Jérôme','Sault Ste. Marie','Granby','Charlottetown','Belleville','North Bay','Shawinigan','Cornwall','Joliette','Vernon','Chilliwack','Wood Buffalo','Saint-Jean-sur-Richelieu','Cape Breton','Saint-Hyacinthe','Whitehorse','Grande Prairie','Fort McMurray','Prince Albert','Moose Jaw','Brandon','Lloydminster','Leamington','Duncan','Orillia','Salaberry-de-Valleyfield','Courtenay','Cranbrook','Brooks','Spruce Grove','White Rock','Yellowknife','Iqaluit'
];

function setVisualStatus(state) {
  const lastStatus = state.lastStatus || (state.running ? 'Running' : 'Stopped');
  statusText.textContent = lastStatus;
  statusDot.className = 'dot ' + (
    lastStatus.toLowerCase().startsWith('success') ? 'success' :
    lastStatus.toLowerCase().startsWith('retrying') ? 'retrying' :
    state.running ? 'running' : 'stopped'
  );
  if (activateButton) activateButton.textContent = state.running ? 'Stop' : 'Activate';
}

async function getState() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    return resp?.state || { running: false, intervalSec: 10, lastStatus: 'Stopped' };
  } catch {
    if (alertBox) alertBox.style.display = 'block';
    return { running: false, intervalSec: 10, lastStatus: 'Stopped' };
  }
}

async function savePrefs(prefs) {
  const cur = await chrome.storage.local.get(STORAGE_KEY);
  const next = { ...(cur[STORAGE_KEY] || {}), ...prefs };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

async function loadPrefs() {
  const cur = await chrome.storage.local.get(STORAGE_KEY);
  return cur[STORAGE_KEY] || { cities: [], city: 'Toronto', distanceKm: 50, workHours: 'Any', sound: 'chime', pauseOnSuccess: false };
}

function renderChips(cities) {
  cityChips.innerHTML = '';
  cities.forEach((c, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = c + ' ';
    const x = document.createElement('button');
    x.textContent = '×';
    x.addEventListener('click', async () => {
      const prefs = await loadPrefs();
      prefs.cities.splice(idx, 1);
      await savePrefs({ cities: prefs.cities });
      renderChips(prefs.cities);
    });
    chip.appendChild(x);
    cityChips.appendChild(chip);
  });
}

async function applyStateToUI() {
  const state = await getState();
  intervalInput.value = String(state.intervalSec ?? 10);
  setVisualStatus(state);
  const prefs = await loadPrefs();
  citySelect.value = prefs.city || 'Toronto';
  distanceKm.value = String(prefs.distanceKm || 50);
  workHours.value = prefs.workHours || 'Any';
  renderChips(prefs.cities || []);
  // Populate autosuggest datalist for cityInput via simple dropdown behavior
  cityInput.setAttribute('list', 'citiesList');
  let dataList = document.getElementById('citiesList');
  if (!dataList) {
    dataList = document.createElement('datalist');
    dataList.id = 'citiesList';
    document.body.appendChild(dataList);
  }
  dataList.innerHTML = CANADA_CITIES.map(c => `<option value="${c}"></option>`).join('');
  if (soundSelect) soundSelect.value = prefs.sound || 'chime';
  if (pauseOnSuccessBtn) pauseOnSuccessBtn.textContent = prefs.pauseOnSuccess ? 'On' : 'Off';
  const theme = (await chrome.storage.local.get(THEME_KEY))[THEME_KEY] || 'dark';
  document.body.classList.toggle('light', theme === 'light');
  if (typeof prefs.volume === 'number' && volumeRange) volumeRange.value = String(prefs.volume);
  if (repeatToggle) repeatToggle.textContent = prefs.repeat ? 'On' : 'Off';
  if (includeKw) includeKw.value = (prefs.includeKw || []).join(', ');
  if (excludeKw) excludeKw.value = (prefs.excludeKw || []).join(', ');
  renderActionLog();
}

activateButton.addEventListener('click', async () => {
  try {
    const intervalSec = Math.max(parseInt(intervalInput.value, 10) || 10, 1);
    const state = await getState();
    if (!state.running) {
      const resp = await chrome.runtime.sendMessage({ type: 'START', intervalSec });
      if (resp?.state) setVisualStatus(resp.state);
    } else {
      const resp = await chrome.runtime.sendMessage({ type: 'STOP' });
      if (resp?.state) setVisualStatus(resp.state);
    }
    if (alertBox) alertBox.style.display = 'none';
  } catch (e) {
    if (alertBox) alertBox.style.display = 'block';
  }
});

intervalInput.addEventListener('change', async () => {
  const intervalSec = Math.max(parseInt(intervalInput.value, 10) || 10, 1);
  const state = await getState();
  if (state.running) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'START', intervalSec });
      if (resp?.state) setVisualStatus(resp.state);
    } catch (e) {
      if (alertBox) alertBox.style.display = 'block';
    }
  }
});

citySelect.addEventListener('change', async () => { await savePrefs({ city: citySelect.value }); });
distanceKm.addEventListener('change', async () => { await savePrefs({ distanceKm: parseInt(distanceKm.value, 10) }); });
workHours.addEventListener('change', async () => { await savePrefs({ workHours: workHours.value }); });

cityInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const value = cityInput.value.trim();
    if (!value) return;
    const prefs = await loadPrefs();
    if (!prefs.cities.includes(value)) prefs.cities.push(value);
    await savePrefs({ cities: prefs.cities });
    renderChips(prefs.cities);
    cityInput.value = '';
  }
});

clearCities.addEventListener('click', async () => {
  await savePrefs({ cities: [] });
  renderChips([]);
});

resetBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: { cities: [], city: 'Toronto', distanceKm: 50, workHours: 'Any', sound: 'chime', pauseOnSuccess: false } });
  await chrome.storage.local.set({ [THEME_KEY]: 'dark' });
  await applyStateToUI();
});

contactBtn?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://www.amazon.jobs/en/contactus' });
});

themeToggle?.addEventListener('click', async () => {
  const cur = (await chrome.storage.local.get(THEME_KEY))[THEME_KEY] || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  await chrome.storage.local.set({ [THEME_KEY]: next });
  document.body.classList.toggle('light', next === 'light');
});

soundSelect?.addEventListener('change', async () => {
  await savePrefs({ sound: soundSelect.value });
});

pauseOnSuccessBtn?.addEventListener('click', async () => {
  const prefs = await loadPrefs();
  const next = !prefs.pauseOnSuccess;
  await savePrefs({ pauseOnSuccess: next });
  pauseOnSuccessBtn.textContent = next ? 'On' : 'Off';
});

volumeRange?.addEventListener('input', async () => {
  const vol = Math.max(0, Math.min(1, Number(volumeRange.value)));
  await savePrefs({ volume: vol });
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_VOLUME', volume: vol });
});

repeatToggle?.addEventListener('click', async () => {
  const prefs = await loadPrefs();
  const next = !prefs.repeat;
  await savePrefs({ repeat: next });
  repeatToggle.textContent = next ? 'On' : 'Off';
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_REPEAT', repeat: next });
});

includeKw?.addEventListener('change', async () => {
  const list = includeKw.value.split(',').map(s => s.trim()).filter(Boolean);
  await savePrefs({ includeKw: list });
});
excludeKw?.addEventListener('change', async () => {
  const list = excludeKw.value.split(',').map(s => s.trim()).filter(Boolean);
  await savePrefs({ excludeKw: list });
});

function renderActionLog() {
  if (!actionLog) return;
  chrome.storage.local.get('actionLog').then(({ actionLog: entries }) => {
    const list = entries || [];
    actionLog.innerHTML = list.slice(-20).reverse().map(e => {
      const time = new Date(e.ts).toLocaleTimeString();
      return `<div>[${time}] ${e.msg}</div>`;
    }).join('');
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['actionLog']) renderActionLog();
});

exportBtn?.addEventListener('click', async () => {
  const all = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  if (chrome.downloads?.download) {
    chrome.downloads.download({ url, filename: 'jaat-settings.json', saveAs: true });
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = 'jaat-settings.json'; a.click();
  }
});

importBtn?.addEventListener('click', () => { importFile?.click(); });
importFile?.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    await chrome.storage.local.set(data);
    await applyStateToUI();
  } catch (_) {}
});

testSound?.addEventListener('click', async () => {
  try {
    const prefs = await loadPrefs();
    if (prefs.sound === 'off') {
      return; // do nothing if sound is off
    }
    if (prefs.sound === 'custom' && prefs.customSound) {
      await chrome.runtime.sendMessage({ type: 'PLAY_SOUND', sound: 'custom' });
    } else {
      await chrome.runtime.sendMessage({ type: 'PLAY_SOUND', sound: prefs.sound || 'chime' });
    }
  } catch (_) {}
});

testDetect?.addEventListener('click', async () => {
  // Ask content script to highlight first detected job instead of clicking
  try {
    const tabs = await chrome.tabs.query({ url: ['https://hiring.amazon.ca/*'] });
    for (const tab of tabs) {
      if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'TEST_DETECT' }).catch(() => {});
    }
  } catch (_) {}
});

uploadSound?.addEventListener('click', () => { customSoundFile?.click(); });
customSoundFile?.addEventListener('change', async () => {
  const file = customSoundFile.files?.[0];
  if (!file) return;
  // Convert file to data URL and store in prefs
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    await savePrefs({ sound: 'custom', customSound: String(dataUrl) });
    if (soundSelect) soundSelect.value = 'custom';
  };
  reader.readAsDataURL(file);
});

// Live status updates via storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes['shiftHelperState']?.newValue) {
    setVisualStatus(changes['shiftHelperState'].newValue);
  }
});

applyStateToUI();



