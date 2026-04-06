// ============================================================
// YouTube Transcript Scraper - Reliable & Self-Healing
// ============================================================

let videoQueue = [];
let currentIndex = 0;
let results = [];
let isProcessing = false;
let currentTabId = null;
let currentVideoNumber = 0;
let totalVideosStored = 0;

const CONFIG = {
    TAB_TIMEOUT_MS: 120000,          // 2 minutes max per video
    BUTTON_RETRY_ATTEMPTS: 10,       // Try to find button 10 times
    BUTTON_RETRY_DELAY_MS: 1000,     // 1 second between retries
    PANEL_WAIT_MS: 20000,            // 20 seconds for panel to appear after click
    SCROLL_ATTEMPTS: 15,
    POST_LOAD_DELAY_MS: 3000,        // Wait 3s after page load before looking for button
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processVideos' && !isProcessing) {
        startScraping(message.urls);
    }
    if (message.action === 'transcriptResult') {
        handleTranscriptResult(message.result, sender.tab?.id);
    }
    if (message.action === 'progressUpdate') {
        updatePopupProgress(message.text);
        chrome.storage.local.set({ progressText: message.text });
    }
});

function startScraping(urls) {
    console.log('[BG] Starting job with', urls.length, 'videos');
    videoQueue = urls.map((url) => ({ url, title: 'Unknown' }));
    currentIndex = 0;
    results = [];
    isProcessing = true;
    totalVideosStored = videoQueue.length;

    // Initialize storage with immutable totalVideos
    chrome.storage.local.set({
        isRunning: true,
        totalVideos: totalVideosStored,
        currentIndex: 0,
        transcripts: [],
        progressText: `Starting to scrape ${totalVideosStored} videos...`,
    });
    updatePopupProgress(`Starting to scrape ${totalVideosStored} videos...`);
    
    processNextVideo();
}

function handleTranscriptResult(result, tabId) {
    console.log(`[BG] Result for ${result.url}: ${result.transcriptError || 'OK'}`);
    results.push(result);
    const completed = results.length;
    
    // Update storage – never change totalVideos
    chrome.storage.local.set({
        currentIndex: completed,
        transcripts: results,
        isRunning: completed < totalVideosStored,
    });
    updatePopupProgress(`Processed ${completed}/${totalVideosStored}: ${result.title || result.url}`);
    
    // Close the tab if it's still open
    if (tabId) {
        chrome.tabs.remove(tabId, () => {});
    }
    
    // Move to next video after a short delay
    setTimeout(() => {
        console.log('[BG] Scheduling next video');
        processNextVideo();
    }, 1500);
}

function processNextVideo() {
    console.log(`[BG] processNextVideo: idx=${currentIndex}, total=${totalVideosStored}, processing=${isProcessing}`);
    
    if (!isProcessing) {
        console.log('[BG] Not processing (job finished or aborted)');
        return;
    }
    
    if (currentIndex >= totalVideosStored) {
        console.log('[BG] All videos processed. Stopping.');
        isProcessing = false;
        updatePopupProgress('All videos processed!', true, results);
        chrome.storage.local.set({ isRunning: false, progressText: '' });
        return;
    }
    
    const video = videoQueue[currentIndex];
    currentVideoNumber = currentIndex + 1;
    currentIndex++;
    
    // Update popup with current video info
    chrome.runtime.sendMessage({
        action: 'currentVideo',
        url: video.url,
        title: 'Loading...',
        current: currentVideoNumber,
        total: totalVideosStored
    }).catch(() => {});
    
    console.log(`[BG] Opening video ${currentVideoNumber}/${totalVideosStored}: ${video.url}`);
    updatePopupProgress(`[${currentVideoNumber}/${totalVideosStored}] Opening...`);
    
    // Create a new tab (not active to stay in background)
    chrome.tabs.create({ url: video.url, active: false }, (tab) => {
        if (chrome.runtime.lastError) {
            console.error(`[BG] Tab create error: ${chrome.runtime.lastError.message}`);
            results.push({
                url: video.url,
                error: `Tab create failed: ${chrome.runtime.lastError.message}`,
            });
            chrome.storage.local.set({ currentIndex: results.length });
            setTimeout(() => processNextVideo(), 2000);
            return;
        }
        
        currentTabId = tab.id;
        let timeoutId = null;
        
        // Set a global timeout for this video
        timeoutId = setTimeout(() => {
            console.warn(`[BG] Global timeout for video ${currentVideoNumber}`);
            if (currentTabId) {
                chrome.tabs.remove(currentTabId, () => {});
                currentTabId = null;
            }
            results.push({ url: video.url, error: 'Global timeout – video took too long' });
            chrome.storage.local.set({ currentIndex: results.length });
            updatePopupProgress(`[${results.length}/${totalVideosStored}] Timeout on ${video.url}`);
            setTimeout(() => processNextVideo(), 2000);
        }, CONFIG.TAB_TIMEOUT_MS);
        
        // Wait for page to load, then inject script
        const onUpdated = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                console.log(`[BG] Tab ${tab.id} loaded, injecting script`);
                clearTimeout(timeoutId);
                
                chrome.scripting
                    .executeScript({
                        target: { tabId: tab.id },
                        func: extractTranscriptFromDOM,
                        args: [video.url, CONFIG, currentVideoNumber, totalVideosStored],
                    })
                    .catch((err) => {
                        console.error(`[BG] Script injection failed: ${err.message}`);
                        chrome.tabs.remove(tab.id, () => {});
                        results.push({
                            url: video.url,
                            error: `Script injection failed: ${err.message}`,
                        });
                        chrome.storage.local.set({ currentIndex: results.length });
                        setTimeout(() => processNextVideo(), 2000);
                    });
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

// ---------- This function runs inside the video page ----------
function extractTranscriptFromDOM(videoUrl, config, videoNumber, totalVideos) {
    let resultSent = false;
    let panelObserver = null;
    let retryCount = 0;
    
    function sendProgress(text) {
        chrome.runtime.sendMessage({ action: 'progressUpdate', text }).catch(() => {});
    }
    
    function sendFinalResult(transcript, error) {
        if (resultSent) return;
        resultSent = true;
        if (panelObserver) panelObserver.disconnect();
        
        // Extract video title and duration
        let title = 'Unknown';
        let duration = 0;
        try {
            const playerMatch = document.documentElement.innerHTML.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/s);
            if (playerMatch) {
                const player = JSON.parse(playerMatch[1]);
                title = player.videoDetails?.title || title;
                duration = parseInt(player.videoDetails?.lengthSeconds, 10) || 0;
            }
        } catch (e) {}
        
        // Update current video display with real title
        chrome.runtime.sendMessage({
            action: 'currentVideo',
            url: videoUrl,
            title: title,
            current: videoNumber,
            total: totalVideos
        }).catch(() => {});
        
        const result = {
            url: videoUrl,
            id: new URL(videoUrl).searchParams.get('v') || '',
            title: title,
            duration: { seconds: duration, formatted: formatDuration(duration) },
            transcript: transcript || '',
            transcriptError: error,
        };
        chrome.runtime.sendMessage({ action: 'transcriptResult', result, videoUrl }).catch(() => {});
    }
    
    function formatDuration(seconds) {
        if (!seconds) return '00:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [h > 0 ? h.toString().padStart(2, '0') : null, m.toString().padStart(2, '0'), s.toString().padStart(2, '0')]
            .filter(Boolean).join(':');
    }
    
    function findInShadow(selector, root = document) {
        let el = root.querySelector(selector);
        if (el) return el;
        for (const elem of root.querySelectorAll('*')) {
            if (elem.shadowRoot) {
                const found = findInShadow(selector, elem.shadowRoot);
                if (found) return found;
            }
        }
        return null;
    }
    
    async function waitForElement(selector, timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = findInShadow(selector);
            if (el) return el;
            await new Promise(r => setTimeout(r, 300));
        }
        return null;
    }
    
    async function openTranscriptPanel() {
        sendProgress('[DOM] Looking for transcript button...');
        
        // Try multiple selectors (common ones)
        const buttonSelectors = [
            'button[aria-label*="Transcript" i]',
            'button[aria-label*="transcript" i]',
            'button[aria-label*="Show transcript" i]',
            'button[aria-label*="转写文稿" i]',
            '#button-shape yt-touch-feedback-shape button',  // new YouTube layout
        ];
        
        for (let attempt = 0; attempt < config.BUTTON_RETRY_ATTEMPTS; attempt++) {
            for (const selector of buttonSelectors) {
                const btn = findInShadow(selector);
                if (btn) {
                    sendProgress('[DOM] Found transcript button, clicking...');
                    btn.click();
                    return true;
                }
            }
            await new Promise(r => setTimeout(r, config.BUTTON_RETRY_DELAY_MS));
        }
        
        // If direct button not found, try "More actions" menu
        sendProgress('[DOM] Direct button not found, trying "More actions" menu...');
        const moreBtn = await waitForElement('button[aria-label="More actions"], button[aria-label*="more" i]', 5000);
        if (moreBtn) {
            moreBtn.click();
            await new Promise(r => setTimeout(r, 1500));
            const menuItem = await waitForElement('ytd-menu-popup-renderer, div[role="menu"]', 3000);
            if (menuItem) {
                const option = Array.from(menuItem.querySelectorAll('*')).find(el =>
                    el.textContent && (el.textContent.includes('Transcript') || el.textContent.includes('转写文稿'))
                );
                if (option) {
                    option.click();
                    return true;
                }
            }
        }
        
        // Check if "No transcript" message is already present
        const noTranscriptMsg = findInShadow('#message, .ytd-transcript-renderer');
        if (noTranscriptMsg && noTranscriptMsg.innerText.includes('No transcript')) {
            sendProgress('[DOM] Video has no transcript available');
            sendFinalResult('', 'No transcript available for this video');
            return false;
        }
        
        return false;
    }
    
    async function extractTranscriptFromPanel(panel) {
        // Determine if old or new format
        let segments = panel.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
        if (segments.length === 0) {
            // Fallback: get all text
            return panel.innerText;
        }
        
        // Scroll to load all dynamic segments
        const scrollable = panel.closest('[scrollable]') || panel;
        let prevCount = 0;
        for (let i = 0; i < config.SCROLL_ATTEMPTS; i++) {
            const currentSegments = panel.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
            if (currentSegments.length === prevCount && prevCount > 0) break;
            prevCount = currentSegments.length;
            scrollable.scrollTop = scrollable.scrollHeight;
            await new Promise(r => setTimeout(r, 600));
            sendProgress(`[DOM] Loaded ${currentSegments.length} segments...`);
        }
        
        const allSegments = panel.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
        let transcript = Array.from(allSegments).map(seg => {
            const textSpan = seg.querySelector('yt-formatted-string, span.yt-core-attributed-string');
            return textSpan ? textSpan.innerText.trim() : seg.innerText.trim();
        }).filter(t => t).join(' ');
        
        // Clean timestamps
        transcript = transcript.replace(/\b\d+:\d+\s*/g, '').replace(/\s+/g, ' ').trim();
        return transcript;
    }
    
    // Start the extraction process after a small delay to let page stabilize
    setTimeout(async () => {
        sendProgress('[DOM] Page loaded, initializing...');
        
        const opened = await openTranscriptPanel();
        if (resultSent) return; // already handled (no transcript)
        if (!opened) {
            sendFinalResult('', 'Transcript button not found (video may not have transcripts)');
            return;
        }
        
        sendProgress('[DOM] Button clicked, waiting for panel to appear...');
        
        // Wait for panel to appear using MutationObserver
        const panelPromise = new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const panel = findInShadow('#segments-container, ytd-transcript-segment-list-renderer, ytd-transcript-renderer, yt-section-list-renderer[data-target-id*="transcript"]');
                if (panel) {
                    clearInterval(checkInterval);
                    resolve(panel);
                }
            }, 500);
            setTimeout(() => {
                clearInterval(checkInterval);
                resolve(null);
            }, config.PANEL_WAIT_MS);
        });
        
        const panel = await panelPromise;
        if (!panel) {
            sendFinalResult('', 'Transcript panel did not appear within timeout');
            return;
        }
        
        sendProgress('[DOM] Panel appeared, extracting transcript...');
        const transcript = await extractTranscriptFromPanel(panel);
        
        if (transcript.length > 30) {
            sendProgress(`[DOM] Success! Extracted ${transcript.length} characters`);
            sendFinalResult(transcript, null);
        } else {
            sendFinalResult('', `Transcript too short (${transcript.length} chars) – possible empty transcript`);
        }
    }, config.POST_LOAD_DELAY_MS);
}

function updatePopupProgress(text, complete = false, data = null) {
    chrome.runtime.sendMessage({
        action: complete ? 'scrapeComplete' : 'updateProgress',
        text,
        data,
    }).catch(() => {});
}