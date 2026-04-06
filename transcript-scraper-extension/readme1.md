# YouTube Transcript Scraper – Chrome Extension

**A powerful Chrome extension to bulk extract transcripts from YouTube videos on any channel, playlist, or search results page.**

## ✨ Features

- **Bulk scraping** – Automatically finds all video links on the current YouTube page and extracts their transcripts.
- **Real-time progress** – Shows a progress bar, current video number, and status updates.
- **Handles missing transcripts** – Detects videos without captions and continues without hanging.
- **Modern dark UI** – Sleek glass-morphism interface with cyan accents.
- **JSON export** – Saves all transcripts (including titles, URLs, durations, and errors) to a single JSON file.

---

## 📦 Installation – "Load unpacked" method

1. **Download the extension files**  
   Place all files (`manifest.json`, `background.js`, `content.js`, `popup.html`, `popup.js`, `styles.css`) into a folder named e.g. `transcript-scraper`.  
   (Optional: create an `icons` subfolder and add `icon.png` 128×128px.)

2. **Open Chrome extensions page**  
   Type `chrome://extensions/` in the address bar and press Enter.

3. **Enable Developer mode**  
   Toggle the switch in the top-right corner.

4. **Click "Load unpacked"**  
   A file dialog appears. Navigate to the folder containing your extension files and select it.

5. **Pin the extension** (optional)  
   Click the puzzle icon in the Chrome toolbar, find "YouTube Transcript Scraper", and click the pin icon to keep it visible.

---

## 🎯 How to use

1. Go to a YouTube page with video links, for example:
   - A channel's **Videos** tab (`youtube.com/@ChannelName/videos`)
   - A **playlist** (`youtube.com/playlist?list=...`)
   - **Search results** (`youtube.com/results?search_query=...`)

2. Click the extension icon in the toolbar.

3. Click **Scrape All Transcripts**.  
   The extension will:
   - Scan the page for all video URLs.
   - Open each video in a background tab.
   - Automatically click the transcript button and extract captions.
   - Show progress (progress bar + "Video X/Y: Title") in the popup.

4. When finished, click **Download JSON** to save the results.

---

## 📁 Output format (JSON)

Each video in the JSON array contains:

```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "id": "videoID",
  "title": "Video title",
  "duration": {
    "seconds": 646,
    "formatted": "10:46"
  },
  "transcript": "Full transcript text (if available)",
  "transcriptError": "Error description (if transcript missing)"
}
```

---

## 🛠️ How it works

- **Content script (`content.js`)** gathers all `<a href=".../watch?v=...">` links on the page.

- **Background service worker (`background.js`)** processes the queue:
  - Opens each video in a new tab (not active).
  - Injects a script that waits for the page to load, then finds and clicks the transcript button.
  - Scrapes the transcript panel (supports both old and new YouTube layouts).
  - Closes the tab and moves to the next video.

- **Popup (`popup.html / popup.js`)**:
  - Displays real-time progress
  - Allows JSON download

---

## ⚠️ Troubleshooting

| Problem | Solution |
|--------|---------|
| No videos found | Make sure you are on a YouTube page with visible video links. Refresh the page and try again. |
| Transcript button not clicked | Some videos have no captions – the extension will skip them and log an error in the JSON. |
| Extension gets stuck | Open the background console (`chrome://extensions` → click on the "service worker" link). Check for red error messages. |
| Progress bar doesn't move | Ensure the popup stays open during scraping. You can close it and reopen to see the latest progress. |

---

## 🔒 Privacy & security

- **No external servers** – All processing happens locally in your browser.
- **No data collection** – Transcripts are only stored temporarily in `chrome.storage.local` and are never sent anywhere.
- **Only YouTube** – The extension only runs on `https://www.youtube.com/*`.

---

## 📜 Permissions explained

- **activeTab** – Access to the current tab when you click the extension icon.
- **storage** – Store scraping progress and results (temporarily).
- **tabs** – Create and close background tabs for each video.
- **scripting** – Inject the transcript-extraction script into YouTube pages.
- **host_permissions (`https://www.youtube.com/*`)** – Required to interact with YouTube's DOM.

---

## 🧪 Version

**v2.1 – Ultra-reliable version with:**

- Fixed tab closing & panel detection  
- Modern black glassmorphic UI  
- Progress bar + current video display  
- Robust handling of missing transcripts and timeouts  
- Parallel processing (up to 3 videos at once) for speed  

---

## 📄 License

**MIT** – Free for personal and commercial use.

---

Enjoy effortless YouTube transcript scraping! 🎥📝