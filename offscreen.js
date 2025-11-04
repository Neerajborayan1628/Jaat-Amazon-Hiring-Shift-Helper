let audioCtx;
let lastPlayTs = 0;
let volume = 1.0;
let repeat = false;

function playChime() {
  try {
    audioCtx = audioCtx || new (self.AudioContext || self.webkitAudioContext)();
    const duration = 0.4;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch (_) {}
}

function playTone(freq, duration = 0.35) {
  try {
    audioCtx = audioCtx || new (self.AudioContext || self.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'OFFSCREEN_PLAY') {
    const now = Date.now();
    // Cooldown 5s
    if (now - lastPlayTs < 5000) return;
    lastPlayTs = now;
    const sound = msg.sound || 'chime';
    if (sound === 'custom') {
      // Load custom data URL from storage and play via <audio>
      chrome.storage.local.get('schedulerPrefs').then((res) => {
        const dataUrl = res?.schedulerPrefs?.customSound;
        if (!dataUrl) { playChime(); return; }
        try {
          const audio = new Audio(dataUrl);
          audio.volume = volume;
          audio.play().catch(() => {});
          if (repeat) {
            audio.addEventListener('ended', () => { audio.currentTime = 0; audio.play().catch(() => {}); });
          }
        } catch (_) { playChime(); }
      });
    } else if (sound === 'ding') {
      playTone(660, 0.25);
    } else if (sound === 'pop') {
      playTone(520, 0.18);
    } else {
      playChime();
    }
  }
  if (msg?.type === 'OFFSCREEN_VOLUME') {
    volume = Math.max(0, Math.min(1, Number(msg.volume)));
  }
  if (msg?.type === 'OFFSCREEN_REPEAT') {
    repeat = Boolean(msg.repeat);
  }
});


