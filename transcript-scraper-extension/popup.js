document.getElementById('scrapeBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.url.includes('youtube.com')) {
        document.getElementById('status').innerText = '❌ Open a YouTube channel or playlist first.';
        return;
    }
    document.getElementById('downloadBtn').style.display = 'none';
    document.getElementById('preview').style.display = 'none';
    await chrome.storage.local.remove(['transcripts', 'progressText']);
    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeVideos' });
        if (response && response.videoUrls.length) {
            chrome.runtime.sendMessage({ action: 'processVideos', urls: response.videoUrls });
            document.getElementById('status').innerText = `📹 Found ${response.videoUrls.length} videos. Processing...`;
        } else {
            document.getElementById('status').innerText = '⚠️ No videos found.';
        }
    } catch (e) {
        if (e.message.includes('Receiving end does not exist')) {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeVideos' });
            chrome.runtime.sendMessage({ action: 'processVideos', urls: response.videoUrls });
            document.getElementById('status').innerText = `📹 Found ${response.videoUrls.length} videos. Processing...`;
        } else {
            document.getElementById('status').innerText = `❌ Error: ${e.message}`;
        }
    }
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'updateProgress') {
        document.getElementById('status').innerText = msg.text;
        chrome.storage.local.set({ progressText: msg.text });
    }
    if (msg.action === 'scrapeComplete') {
        document.getElementById('status').innerText = '✅ Complete!';
        document.getElementById('downloadBtn').style.display = 'block';
        chrome.storage.local.set({ transcripts: msg.data, progressText: '' });
        if (msg.data && msg.data[0]) {
            const preview = document.getElementById('preview');
            preview.style.display = 'block';
            preview.innerHTML = `<h4>📄 Preview (first)</h4><p><strong>${escapeHtml(msg.data[0].title)}</strong><br>${escapeHtml((msg.data[0].transcript || '').substring(0, 300))}...</p>`;
        }
    }
});

function escapeHtml(str) { return str.replace(/[&<>]/g, function(m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; }); }

chrome.storage.local.get(['progressText', 'transcripts'], (data) => {
    if (data.progressText) document.getElementById('status').innerText = data.progressText;
    if (data.transcripts && data.transcripts.length) {
        document.getElementById('downloadBtn').style.display = 'block';
        const preview = document.getElementById('preview');
        preview.style.display = 'block';
        preview.innerHTML = `<h4>📄 Preview (first)</h4><p><strong>${escapeHtml(data.transcripts[0].title)}</strong><br>${escapeHtml((data.transcripts[0].transcript || '').substring(0, 300))}...</p>`;
    }
});

setInterval(() => {
    chrome.storage.local.get(['progressText'], (data) => {
        if (data.progressText) document.getElementById('status').innerText = data.progressText;
    });
}, 1000);

document.getElementById('downloadBtn').addEventListener('click', () => {
    chrome.storage.local.get('transcripts', (res) => {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.transcripts, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = 'transcripts.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
});