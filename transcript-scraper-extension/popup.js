// popup.js – shows progress with auto-refresh

document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.includes('youtube.com')) {
        document.getElementById('status').innerText = 'Please navigate to a YouTube page.';
        return;
    }

    // Clear previous state
    await chrome.storage.local.remove([
        'transcripts',
        'totalVideos',
        'currentIndex',
        'isRunning',
        'progressText',
    ]);

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeVideos' });
        if (response && response.videoUrls && response.videoUrls.length) {
            chrome.runtime.sendMessage({ action: 'processVideos', urls: response.videoUrls });
            document.getElementById('status').innerText = `Found ${response.videoUrls.length} videos. Scraping started...`;
            chrome.storage.local.set({
                progressText: `Found ${response.videoUrls.length} videos. Scraping started...`,
            });
        } else {
            document.getElementById('status').innerText = 'No videos found on this page.';
        }
    } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
            document.getElementById('status').innerText = 'Injecting content script...';
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js'],
            });
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeVideos' });
            chrome.runtime.sendMessage({ action: 'processVideos', urls: response.videoUrls });
            document.getElementById('status').innerText = `Found ${response.videoUrls.length} videos. Scraping started...`;
        } else {
            document.getElementById('status').innerText = 'Error: ' + error.message;
        }
    }
});

// Listen for progress updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProgress') {
        document.getElementById('status').innerText = message.text;
        chrome.storage.local.set({ progressText: message.text });
    }
    if (message.action === 'scrapeComplete') {
        document.getElementById('status').innerText = 'All transcripts scraped!';
        document.getElementById('downloadBtn').style.display = 'block';
        chrome.storage.local.set({ transcripts: message.data, isRunning: false, progressText: '' });
        
        // Also show first transcript in the box
        if (message.data && message.data.length > 0) {
            const output = document.getElementById('transcript-output');
            output.innerHTML = '';
            const preview = document.createElement('div');
            preview.innerHTML = `<strong>Preview (first video):</strong><br><br>${message.data[0].title || 'Untitled'}<br><br>${(message.data[0].transcript || '').substring(0, 500)}${(message.data[0].transcript || '').length > 500 ? '...' : ''}`;
            output.appendChild(preview);
        }
    }
});

// Restore progress when popup opens
chrome.storage.local.get(
    ['progressText', 'isRunning', 'currentIndex', 'totalVideos', 'transcripts'],
    (data) => {
        if (data.progressText) {
            document.getElementById('status').innerText = data.progressText;
        } else if (data.isRunning && data.totalVideos) {
            document.getElementById('status').innerText = `Scraping in progress: ${data.currentIndex}/${data.totalVideos} videos processed.`;
        }
        
        // Show existing transcripts if any
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
    chrome.storage.local.get(['progressText'], (data) => {
        if (data.progressText) {
            document.getElementById('status').innerText = data.progressText;
        }
    });
}, 1000);

document.getElementById('downloadBtn').addEventListener('click', () => {
    chrome.storage.local.get('transcripts', (result) => {
        const dataStr =
            'data:text/json;charset=utf-8,' +
            encodeURIComponent(JSON.stringify(result.transcripts, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = 'transcripts.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
});