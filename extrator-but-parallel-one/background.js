// ============================================================
// YouTube Transcript Scraper - Fast & Reliable (No Tab Reuse)
// ============================================================

let videoQueue = [];
let currentIndex = 0;
let results = [];
let isProcessing = false;
let activeTabs = 0;
let pendingResults = [];
let storageInterval = null;
let totalVideosStored = 0;

const MAX_CONCURRENT = 3;  // Process up to 3 videos simultaneously

const CONFIG = {
    TAB_TIMEOUT_MS: 60000,          // 60 seconds per video
    INJECTED_TIMEOUT_MS: 45000,     // 45 seconds for injected script
    PANEL_WAIT_MS: 8000,            // 8 seconds for panel to appear
    SCROLL_ATTEMPTS: 8,             // Reduced scroll attempts
    POST_LOAD_DELAY_MS: 1500,       // Reduced initial delay
    BUTTON_RETRY_DELAY_MS: 500,
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
    videoQueue = urls.map((url, idx) => ({ url, title: 'Unknown', index: idx }));
    currentIndex = 0;
    results = [];
    pendingResults = [];
    isProcessing = true;
    totalVideosStored = videoQueue.length;
    activeTabs = 0;

    chrome.storage.local.set({
        isRunning: true,
        totalVideos: totalVideosStored,
        currentIndex: 0,
        transcripts: [],
        progressText: `Starting to scrape ${totalVideosStored} videos...`,
    });
    updatePopupProgress(`Starting to scrape ${totalVideosStored} videos...`);

    // Batch storage writes every 3 seconds
    if (storageInterval) clearInterval(storageInterval);
    storageInterval = setInterval(() => {
        if (pendingResults.length) {
            results.push(...pendingResults);
            chrome.storage.local.set({
                currentIndex: results.length,
                transcripts: results,
            });
            pendingResults = [];
        }
    }, 3000);

    processNextVideo();
}

function handleTranscriptResult(result, tabId) {
    console.log(`[BG] Result for ${result.url}: ${result.transcriptError || 'OK'}`);
    pendingResults.push(result);
    const processedCount = results.length + pendingResults.length;
    updatePopupProgress(`Processed ${processedCount}/${totalVideosStored}: ${result.title || result.url}`);

    // Close the tab now that it's done (no reuse)
    if (tabId) {
        chrome.tabs.remove(tabId, () => {});
    }

    activeTabs--;

    if (currentIndex >= totalVideosStored && activeTabs === 0) {
        finishScraping();
    } else {
        processNextVideo();
    }
}

function finishScraping() {
    console.log('[BG] All videos processed. Finishing.');
    isProcessing = false;
    if (storageInterval) clearInterval(storageInterval);
    if (pendingResults.length) {
        results.push(...pendingResults);
        chrome.storage.local.set({ transcripts: results });
        pendingResults = [];
    }
    updatePopupProgress('All videos processed!', true, results);
    chrome.storage.local.set({ isRunning: false, progressText: '' });
}

function processNextVideo() {
    if (!isProcessing) return;
    while (activeTabs < MAX_CONCURRENT && currentIndex < totalVideosStored) {
        const video = videoQueue[currentIndex];
        currentIndex++;
        activeTabs++;
        console.log(`[BG] Starting video ${currentIndex}/${totalVideosStored} (active: ${activeTabs})`);
        openVideoTab(video);
    }
}

function openVideoTab(video) {
    chrome.tabs.create({ url: video.url, active: false }, (tab) => {
        if (chrome.runtime.lastError) {
            console.error(`[BG] Tab create error: ${chrome.runtime.lastError.message}`);
            pendingResults.push({
                url: video.url,
                error: `Tab create failed: ${chrome.runtime.lastError.message}`,
            });
            activeTabs--;
            processNextVideo();
            return;
        }

        const timeoutId = setTimeout(() => {
            console.warn(`[BG] Timeout for ${video.url}`);
            chrome.tabs.remove(tab.id, () => {});
            pendingResults.push({
                url: video.url,
                error: 'Timeout – page did not load in time',
            });
            activeTabs--;
            processNextVideo();
        }, CONFIG.TAB_TIMEOUT_MS);

        const onUpdated = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                clearTimeout(timeoutId);
                chrome.scripting
                    .executeScript({
                        target: { tabId: tab.id },
                        func: extractTranscriptFromDOM,
                        args: [video.url, CONFIG, currentIndex, totalVideosStored],
                    })
                    .catch((err) => {
                        console.error(`[BG] Script injection failed: ${err.message}`);
                        chrome.tabs.remove(tab.id, () => {});
                        pendingResults.push({
                            url: video.url,
                            error: `Script injection failed: ${err.message}`,
                        });
                        activeTabs--;
                        processNextVideo();
                    });
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

// ---------- This function runs inside the video page ----------
function extractTranscriptFromDOM(videoUrl, config, videoNumber, totalVideos) {
    let resultSent = false;
    let safetyTimeout = null;

    function sendProgress(text) {
        chrome.runtime.sendMessage({ action: 'progressUpdate', text }).catch(() => {});
    }

    function sendFinalResult(transcript, error) {
        if (resultSent) return;
        resultSent = true;
        if (safetyTimeout) clearTimeout(safetyTimeout);

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

    async function waitForButton() {
        return new Promise((resolve) => {
            const observer = new MutationObserver(() => {
                const btn = findInShadow('button[aria-label*="Transcript" i], button[aria-label*="transcript" i], button[aria-label*="Show transcript" i]');
                if (btn) {
                    observer.disconnect();
                    resolve(btn);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, 5000);
        });
    }

    async function openTranscriptPanel() {
        sendProgress('[DOM] Waiting for transcript button...');
        let button = await waitForButton();
        if (button) {
            button.click();
            sendProgress('[DOM] Clicked transcript button');
            return true;
        }

        // Fallback: "More actions" menu
        sendProgress('[DOM] Direct button not found, trying "More actions"...');
        const moreBtn = findInShadow('button[aria-label="More actions"], button[aria-label*="more" i]');
        if (moreBtn) {
            moreBtn.click();
            await new Promise(r => setTimeout(r, 1000));
            const menuItem = findInShadow('ytd-menu-popup-renderer, div[role="menu"]');
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

        const noMsg = findInShadow('#message, .ytd-transcript-renderer');
        if (noMsg && noMsg.innerText.includes('No transcript')) {
            sendProgress('[DOM] No transcript available');
            sendFinalResult('', 'No transcript available for this video');
            return false;
        }
        return false;
    }

    async function waitForPanel() {
        const start = Date.now();
        while (Date.now() - start < config.PANEL_WAIT_MS) {
            const panel = findInShadow('#segments-container, ytd-transcript-segment-list-renderer, ytd-transcript-renderer, yt-section-list-renderer[data-target-id*="transcript"]');
            if (panel) return panel;
            await new Promise(r => setTimeout(r, 200));
        }
        return null;
    }

    async function extractTranscriptFromPanel(panel) {
        let segments = panel.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
        if (segments.length === 0) {
            return panel.innerText;
        }

        const scrollable = panel.closest('[scrollable]') || panel;
        if (scrollable.scrollHeight > scrollable.clientHeight + 100) {
            let prevCount = 0;
            for (let i = 0; i < config.SCROLL_ATTEMPTS; i++) {
                const currentSegments = panel.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
                if (currentSegments.length === prevCount && prevCount > 0) break;
                prevCount = currentSegments.length;
                scrollable.scrollTop = scrollable.scrollHeight;
                await new Promise(r => setTimeout(r, 200));
                sendProgress(`[DOM] Loaded ${currentSegments.length} segments...`);
            }
            segments = panel.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model');
        }

        let transcript = Array.from(segments).map(seg => {
            const textSpan = seg.querySelector('yt-formatted-string, span.yt-core-attributed-string');
            return textSpan ? textSpan.innerText.trim() : seg.innerText.trim();
        }).filter(t => t).join(' ');
        transcript = transcript.replace(/\b\d+:\d+\s*/g, '').replace(/\s+/g, ' ').trim();
        return transcript;
    }

    safetyTimeout = setTimeout(() => {
        sendFinalResult('', 'Extraction timeout after 45 seconds');
    }, config.INJECTED_TIMEOUT_MS);

    (async () => {
        // Small delay to let page settle, but shorter than before
        await new Promise(r => setTimeout(r, config.POST_LOAD_DELAY_MS));
        sendProgress('[DOM] Page ready, looking for transcript...');
        const opened = await openTranscriptPanel();
        if (resultSent) return;
        if (!opened) {
            sendFinalResult('', 'Transcript button not found');
            return;
        }

        sendProgress('[DOM] Waiting for panel...');
        const panel = await waitForPanel();
        if (!panel) {
            sendFinalResult('', 'Transcript panel did not appear');
            return;
        }

        sendProgress('[DOM] Extracting transcript...');
        const transcript = await extractTranscriptFromPanel(panel);
        if (transcript.length > 30) {
            sendProgress(`[DOM] Success! ${transcript.length} chars`);
            sendFinalResult(transcript, null);
        } else {
            sendFinalResult('', `Transcript too short (${transcript.length} chars)`);
        }
    })();
}

function updatePopupProgress(text, complete = false, data = null) {
    chrome.runtime.sendMessage({
        action: complete ? 'scrapeComplete' : 'updateProgress',
        text,
        data,
    }).catch(() => {});
}