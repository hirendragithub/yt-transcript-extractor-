// popup.js – fully functional with working JSON, CSV, TXT download
let currentState = {
  isRunning: false,
  totalVideos: 0,
  currentIndex: 0,
  transcripts: [],
  videos: []
};

const elements = {
  pageType: document.getElementById('pageType'),
  videoCount: document.getElementById('videoCount'),
  scrapedCount: document.getElementById('scrapedCount'),
  errorCount: document.getElementById('errorCount'),
  progressSection: document.getElementById('progressSection'),
  progressFill: document.getElementById('progressFill'),
  currentVideo: document.getElementById('currentVideo'),
  statusMessage: document.getElementById('statusMessage'),
  scrapeBtn: document.getElementById('scrapeBtn'),
  stopBtn: document.getElementById('stopBtn'),
  downloadSection: document.getElementById('downloadSection'),
  downloadJson: document.getElementById('downloadJson'),
  downloadCsv: document.getElementById('downloadCsv'),
  downloadTxt: document.getElementById('downloadTxt'),
  previewSection: document.getElementById('previewSection'),
  previewContent: document.getElementById('previewContent')
};

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url.includes('youtube.com')) {
    updateStatus('Please navigate to a YouTube page', 'error');
    return;
  }
  await detectVideos(tab);
  await loadScrapingState();
  setupListeners();
  startPeriodicUpdate();
}

async function detectVideos(tab) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const anchors = document.querySelectorAll('a[href*="/watch?v="]');
        const urls = new Set();
        anchors.forEach(a => {
          let href = a.href;
          if (href.startsWith('/')) href = 'https://www.youtube.com' + href;
          if (href.includes('watch?v=')) urls.add(href);
        });
        const pageType = window.location.href.includes('/playlist') ? 'playlist' :
                         window.location.href.includes('/@') ? 'channel' : 'unknown';
        return { urls: Array.from(urls), pageType };
      }
    });
    const { urls, pageType } = results[0].result;
    currentState.videos = urls.map(url => ({ 
      url, 
      title: 'Unknown', 
      videoId: new URL(url).searchParams.get('v') 
    }));
    currentState.totalVideos = urls.length;
    elements.videoCount.textContent = urls.length;
    elements.scrapeBtn.disabled = urls.length === 0;
    updatePageTypeBadge(pageType);
    updatePreview();
    if (urls.length === 0) updateStatus('No videos found on this page', 'error');
  } catch (err) {
    updateStatus('Error detecting videos', 'error');
  }
}

function updatePageTypeBadge(type) {
  elements.pageType.className = 'badge';
  if (type === 'playlist') {
    elements.pageType.textContent = 'Playlist';
    elements.pageType.classList.add('playlist');
  } else if (type === 'channel') {
    elements.pageType.textContent = 'Channel';
    elements.pageType.classList.add('channel');
  } else {
    elements.pageType.textContent = 'YouTube';
    elements.pageType.classList.add('valid');
  }
}

function updatePreview() {
  if (!currentState.videos.length) {
    elements.previewSection.style.display = 'none';
    return;
  }
  elements.previewSection.style.display = 'block';
  elements.previewContent.innerHTML = `
    <div class="video-list">
      ${currentState.videos.map(v => `
        <div class="video-item">
          <img class="video-thumbnail" src="https://i.ytimg.com/vi/${v.videoId}/default.jpg" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 36%22%3E%3Crect width=%2248%22 height=%2236%22 fill=%22%23333%22/%3E%3C/svg%3E'">
          <div class="video-info">
            <div class="video-title">${escapeHtml(v.title || 'Loading...')}</div>
            <div class="video-meta">${v.videoId}</div>
          </div>
          <span class="video-status pending" data-id="${v.videoId}">Pending</span>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

async function loadScrapingState() {
  const data = await chrome.storage.local.get(['isRunning', 'totalVideos', 'currentIndex', 'transcripts']);
  currentState.isRunning = data.isRunning || false;
  currentState.totalVideos = data.totalVideos || 0;
  currentState.currentIndex = data.currentIndex || 0;
  currentState.transcripts = data.transcripts || [];
  updateStats();
  if (currentState.isRunning) {
    elements.progressSection.style.display = 'block';
    updateProgressBar(currentState.currentIndex, currentState.totalVideos);
    elements.scrapeBtn.disabled = true;
    elements.stopBtn.disabled = false;
  } else {
    if (currentState.transcripts && currentState.transcripts.length > 0) {
      elements.downloadSection.style.display = 'block';
    }
  }
}

function updateStats() {
  if (!currentState.transcripts) return;
  const scraped = currentState.transcripts.filter(t => t.transcript && !t.transcriptError).length;
  const errors = currentState.transcripts.filter(t => t.transcriptError).length;
  elements.scrapedCount.textContent = scraped;
  elements.errorCount.textContent = errors;
}

function updateProgressBar(current, total) {
  if (total && total > 0) {
    const percent = (current / total) * 100;
    elements.progressFill.style.width = `${percent}%`;
  } else {
    elements.progressFill.style.width = '0%';
  }
}

function updateCurrentVideo(current, total, title) {
  if (total && total > 0 && current > 0) {
    elements.currentVideo.textContent = `${current}/${total} – ${title || 'Loading...'}`;
  } else {
    elements.currentVideo.textContent = '—';
  }
}

function updateStatus(msg, type = '') {
  elements.statusMessage.textContent = msg;
  elements.statusMessage.className = 'status-message';
  if (type) elements.statusMessage.classList.add(type);
}

function setupListeners() {
  elements.scrapeBtn.addEventListener('click', startScraping);
  elements.stopBtn.addEventListener('click', stopScraping);
  elements.downloadJson.addEventListener('click', () => downloadData('json'));
  elements.downloadCsv.addEventListener('click', () => downloadData('csv'));
  elements.downloadTxt.addEventListener('click', () => downloadData('txt'));
}

async function startScraping() {
  if (!currentState.videos.length) {
    updateStatus('No videos to scrape', 'error');
    return;
  }
  const urls = currentState.videos.map(v => v.url);
  chrome.runtime.sendMessage({ action: 'processVideos', urls });
  updateStatus('Scraping started...', 'info');
  elements.scrapeBtn.disabled = true;
  elements.stopBtn.disabled = false;
  elements.progressSection.style.display = 'block';
  elements.downloadSection.style.display = 'none';
  currentState.isRunning = true;
}

async function stopScraping() {
  chrome.runtime.sendMessage({ action: 'stopScraping' });
  updateStatus('Stopping...', 'info');
  elements.stopBtn.disabled = true;
}

async function downloadData(format) {
  const result = await chrome.storage.local.get(['transcripts']);
  const transcripts = result.transcripts;
  
  if (!transcripts || transcripts.length === 0) {
    updateStatus('No transcripts to download. Please scrape first.', 'error');
    return;
  }

  let content = '';
  let filename = `youtube-transcripts-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}`;
  let mimeType = 'text/plain';

  if (format === 'json') {
    content = JSON.stringify(transcripts, null, 2);
    filename += '.json';
    mimeType = 'application/json';
  } else if (format === 'csv') {
    // Safe CSV generation with proper escaping
    const headers = ['URL', 'Title', 'Video ID', 'Duration (sec)', 'Duration (formatted)', 'Transcript Text', 'Error', 'Scraped At'];
    const rows = transcripts.map(t => {
      // Helper to escape CSV fields
      const escapeCsv = (str) => {
        if (str === undefined || str === null) return '';
        const string = String(str);
        if (string.includes(',') || string.includes('"') || string.includes('\n')) {
          return '"' + string.replace(/"/g, '""') + '"';
        }
        return string;
      };
      const durationSec = t.duration?.seconds !== undefined ? t.duration.seconds : (t.duration ? t.duration : '');
      const durationFmt = t.duration?.formatted || (typeof t.duration === 'string' ? t.duration : '');
      return [
        escapeCsv(t.url || ''),
        escapeCsv(t.title || ''),
        escapeCsv(t.id || ''),
        escapeCsv(durationSec),
        escapeCsv(durationFmt),
        escapeCsv(t.transcript || ''),
        escapeCsv(t.transcriptError || ''),
        escapeCsv(new Date().toISOString())
      ];
    });
    content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    filename += '.csv';
    mimeType = 'text/csv';
  } else if (format === 'txt') {
    // Human-readable text format
    content = transcripts.map(t => {
      const durationStr = t.duration?.formatted || (typeof t.duration === 'string' ? t.duration : 'N/A');
      let section = `========================================\n`;
      section += `Title: ${t.title || 'Unknown'}\n`;
      section += `URL: ${t.url || ''}\n`;
      section += `Video ID: ${t.id || ''}\n`;
      section += `Duration: ${durationStr}\n`;
      if (t.transcript) {
        section += `\n--- Transcript ---\n${t.transcript}\n`;
      } else if (t.transcriptError) {
        section += `\n--- Error ---\n${t.transcriptError}\n`;
      } else {
        section += `\n--- No transcript available ---\n`;
      }
      section += `========================================\n\n`;
      return section;
    }).join('');
    filename += '.txt';
    mimeType = 'text/plain';
  } else {
    updateStatus('Unsupported format', 'error');
    return;
  }

  try {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
    URL.revokeObjectURL(url);
    updateStatus(`Downloaded ${format.toUpperCase()}`, 'success');
  } catch (err) {
    console.error('Download error:', err);
    updateStatus('Download failed: ' + err.message, 'error');
  }
}

function startPeriodicUpdate() {
  setInterval(async () => {
    const data = await chrome.storage.local.get(['isRunning', 'totalVideos', 'currentIndex', 'transcripts', 'currentVideoTitle', 'currentVideoNum']);
    currentState.isRunning = data.isRunning || false;
    currentState.totalVideos = data.totalVideos || 0;
    currentState.currentIndex = data.currentIndex || 0;
    currentState.transcripts = data.transcripts || [];
    updateStats();
    
    if (currentState.isRunning) {
      elements.progressSection.style.display = 'block';
      updateProgressBar(currentState.currentIndex, currentState.totalVideos);
      updateCurrentVideo(data.currentVideoNum, currentState.totalVideos, data.currentVideoTitle);
      elements.scrapeBtn.disabled = true;
      elements.stopBtn.disabled = false;
      elements.downloadSection.style.display = 'none';
    } else {
      if (currentState.transcripts && currentState.transcripts.length > 0) {
        elements.downloadSection.style.display = 'block';
      }
      elements.stopBtn.disabled = true;
      elements.scrapeBtn.disabled = (currentState.videos.length === 0);
      if (currentState.currentIndex >= currentState.totalVideos && currentState.totalVideos > 0 && !currentState.isRunning) {
        updateStatus('Scraping completed!', 'success');
        elements.progressSection.style.display = 'none';
      }
    }
    // Update video statuses in preview
    if (currentState.transcripts && currentState.transcripts.length) {
      document.querySelectorAll('.video-status').forEach(el => {
        const id = el.getAttribute('data-id');
        const found = currentState.transcripts.find(t => t.id === id);
        if (found) {
          if (found.transcript) el.className = 'video-status completed';
          else if (found.transcriptError) el.className = 'video-status error';
        }
      });
    }
  }, 1000);
}

document.addEventListener('DOMContentLoaded', init);