// popup.js – robust progress display
const progressFill = document.getElementById('progressFill');
const currentVideoSpan = document.getElementById('currentVideo');

function updateProgressBar(current, total) {
    if (!progressFill) return;
    if (total && total > 0) {
        let percent = (current / total) * 100;
        percent = Math.min(100, Math.max(0, percent));
        progressFill.style.width = `${percent}%`;
    } else {
        progressFill.style.width = '0%';
    }
}

function updateCurrentVideo(current, total, title, url) {
    if (!currentVideoSpan) return;
    if (total && total > 0 && current && current > 0) {
        let displayText = `Video ${current}/${total}`;
        if (title && title !== 'Unknown' && title !== 'Loading...') {
            displayText += `: ${title.substring(0, 50)}${title.length > 50 ? '…' : ''}`;
        } else if (url) {
            try {
                const videoId = new URL(url).searchParams.get('v');
                if (videoId) displayText += ` (ID: ${videoId})`;
            } catch(e) {}
        }
        currentVideoSpan.textContent = displayText;
    } else {
        currentVideoSpan.textContent = '—';
    }
}

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.includes('youtube.com')) {
        document.getElementById('status').innerText = 'Please navigate to a YouTube page.';
        return;
    }
    // Clear previous state
    await chrome.storage.local.remove([
        'transcripts', 'totalVideos', 'currentIndex', 'isRunning', 'progressText',
        'currentVideoUrl', 'currentVideoTitle', 'currentVideoNum'
    ]);
    updateProgressBar(0, 0);
    updateCurrentVideo(0, 0, '', '');
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeVideos' });
        if (response && response.videoUrls && response.videoUrls.length) {
            chrome.runtime.sendMessage({ action: 'processVideos', urls: response.videoUrls });
            document.getElementById('status').innerText = `Found ${response.videoUrls.length} videos. Scraping started...`;
            chrome.storage.local.set({
                progressText: `Found ${response.videoUrls.length} videos. Scraping started...`,
                totalVideos: response.videoUrls.length,
                currentIndex: 0,
            });
            updateProgressBar(0, response.videoUrls.length);
        } else {
            document.getElementById('status').innerText = 'No videos found on this page.';
        }
    } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
            document.getElementById('status').innerText = 'Injecting content script...';
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeVideos' });
            chrome.runtime.sendMessage({ action: 'processVideos', urls: response.videoUrls });
            document.getElementById('status').innerText = `Found ${response.videoUrls.length} videos. Scraping started...`;
            chrome.storage.local.set({ totalVideos: response.videoUrls.length, currentIndex: 0 });
            updateProgressBar(0, response.videoUrls.length);
        } else {
            document.getElementById('status').innerText = 'Error: ' + error.message;
        }
    }
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProgress') {
        document.getElementById('status').innerText = message.text;
        chrome.storage.local.set({ progressText: message.text });
    }
    if (message.action === 'currentVideo') {
        updateCurrentVideo(message.current, message.total, message.title, message.url);
        chrome.storage.local.set({
            currentVideoUrl: message.url,
            currentVideoTitle: message.title,
            currentVideoNum: message.current,
            totalVideos: message.total
        });
    }
    if (message.action === 'scrapeComplete') {
        document.getElementById('status').innerText = 'All transcripts scraped!';
        document.getElementById('downloadBtn').style.display = 'block';
        chrome.storage.local.set({ transcripts: message.data, isRunning: false, progressText: '', currentVideoUrl: '', currentVideoTitle: '', currentVideoNum: 0 });
        updateProgressBar(1, 1);
        updateCurrentVideo(0, 0, '', '');
        
        if (message.data && message.data.length > 0) {
            const output = document.getElementById('transcript-output');
            output.innerHTML = '';
            const preview = document.createElement('div');
            preview.innerHTML = `<strong>Preview (first video):</strong><br><br>${message.data[0].title || 'Untitled'}<br><br>${(message.data[0].transcript || '').substring(0, 500)}${(message.data[0].transcript || '').length > 500 ? '...' : ''}`;
            output.appendChild(preview);
        }
    }
});

// Restore state when popup opens
chrome.storage.local.get(
    ['progressText', 'isRunning', 'currentIndex', 'totalVideos', 'transcripts', 'currentVideoUrl', 'currentVideoTitle', 'currentVideoNum'],
    (data) => {
        if (data.progressText) {
            document.getElementById('status').innerText = data.progressText;
        } else if (data.isRunning && data.totalVideos && data.totalVideos > 0) {
            document.getElementById('status').innerText = `Scraping in progress: ${data.currentIndex || 0}/${data.totalVideos} videos processed.`;
        }
        if (data.totalVideos && data.totalVideos > 0) {
            updateProgressBar(data.currentIndex || 0, data.totalVideos);
        }
        if (data.currentVideoNum && data.totalVideos && data.totalVideos > 0) {
            updateCurrentVideo(data.currentVideoNum, data.totalVideos, data.currentVideoTitle, data.currentVideoUrl);
        }
        
        if (data.transcripts && data.transcripts.length > 0 && !data.isRunning) {
            document.getElementById('downloadBtn').style.display = 'block';
            const output = document.getElementById('transcript-output');
            output.innerHTML = '';
            const preview = document.createElement('div');
            preview.innerHTML = `<strong>Preview (first video):</strong><br><br>${data.transcripts[0].title || 'Untitled'}<br><br>${(data.transcripts[0].transcript || '').substring(0, 500)}${(data.transcripts[0].transcript || '').length > 500 ? '...' : ''}`;
            output.appendChild(preview);
        }
    }
);

// Refresh every second
setInterval(() => {
    chrome.storage.local.get(['progressText', 'currentIndex', 'totalVideos', 'currentVideoNum', 'currentVideoTitle', 'currentVideoUrl'], (data) => {
        if (data.progressText) document.getElementById('status').innerText = data.progressText;
        if (data.totalVideos && data.totalVideos > 0) {
            updateProgressBar(data.currentIndex || 0, data.totalVideos);
            if (data.currentVideoNum && data.totalVideos > 0) {
                updateCurrentVideo(data.currentVideoNum, data.totalVideos, data.currentVideoTitle, data.currentVideoUrl);
            }
        }
    });
}, 1000);

document.getElementById('downloadBtn').addEventListener('click', () => {
    chrome.storage.local.get('transcripts', (result) => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(result.transcripts, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = 'transcripts.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
});