#+ 🧩 Jaat – Amazon Hiring Shift Helper

A Chrome extension that automates job shift booking on [hiring.amazon.ca](https://hiring.amazon.ca).  
It refreshes the page, detects available shifts, clicks **“Apply”** or **“Book”** buttons automatically, and notifies you with sound when a shift is successfully claimed.  

---

## 🔍 Main Purpose

Automatically refresh and apply for available Amazon shifts, saving time and ensuring you never miss an opportunity.  

## 🧠 Key Features

| Feature | Description | Main Files |
|---------|-------------|------------|
| **Auto Apply / Claim Bot** | Detects “Apply”, “Claim”, or “Book Shift” buttons and clicks them automatically using human-like timing. | `content.js` |
| **Auto Refresh Engine** | Periodically refreshes the Amazon Hiring page to check for new shifts using Chrome Alarms API. | `background.js` |
| **Start / Stop Control Panel** | Popup UI lets you start or stop automation, adjust interval, and view live status. | `popup.html`, `popup.js` |
| **Sound Notifications** | Plays tones (“ding”, “pop”, “chime”) or custom uploaded sounds when a job is claimed. | `offscreen.js`, `offscreen.html` |
| **Custom Refresh Interval** | User-configurable refresh time (default 10–60s). Stored persistently in Chrome storage. | `background.js`, `popup.js` |
| **City & Location Filter** | Lets users select preferred Canadian cities and distance filters for job searches. | `popup.js` |
| **Persistent Preferences** | Saves all settings (sound, interval, cities, theme) to Chrome’s local storage. | `popup.js` |
| **Modern Manifest V3 Support** | Uses service worker background, offscreen documents, and scripting APIs compliant with MV3. | `manifest.json` |
| **Real-time Status Updates** | Live status indicators and logs showing Running / Stopped / Success states. | `popup.js`, `background.js` |
| **Lightweight & Secure** | Only requires minimal Chrome permissions and runs only on `https://hiring.amazon.ca/*`. | `manifest.json` |

---
## 🧱 Architecture Overview

📦 Jaat-Amazon-Shift-Helper

📦 Jaat-Amazon-Shift-Helper
├── manifest.json         # Extension manifest (MV3)
├── background.js         # Core scheduler & state manager
├── content.js            # Page automation (button detection & clicker)
├── offscreen.html/.js    # Sound notification handler
├── popup.html/.js        # User control panel UI
└── icons/                # App icons (16px, 48px, 128px)



---

## 🔔 Example Workflow

1. User clicks **Activate** in the popup.  
2. Background worker starts an interval (e.g., every 60s).  
3. Sends a message to the active tab → `content.js` scans & clicks job buttons.  
4. When successful, `offscreen.js` plays a sound alert.  
5. Popup updates live status (`Shift Booked ✅`).  

---

## 🚀 Installation

1. Clone or download this repository.  
2. Open Chrome and navigate to `chrome://extensions/`.  
3. Enable **Developer Mode** (top-right corner).  
4. Click **Load unpacked** and select the project folder.  
5. The extension should appear in your toolbar.  

---

## ⚖️ Disclaimer

This extension is meant for **personal productivity purposes**. Use responsibly and ensure compliance with Amazon’s terms of service.  




