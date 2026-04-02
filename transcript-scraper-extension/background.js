// ============================================================
// YouTube Transcript Scraper - Fixed Tab Closing & Panel Detection
// ============================================================

let videoQueue = [];
let currentIndex = 0;
let results = [];
let isProcessing = false;

const CONFIG = {
    TAB_TIMEOUT_MS: 90000,      // 90 seconds per video (outer timeout)
    INJECTED_TIMEOUT_MS: 60000, // 60 seconds for injected script to finish
    PANEL_WAIT_MS: 30000,       // 30 seconds for panel to appear
    SCROLL_ATTEMPTS: 20,
    POST_LOAD_DELAY_MS: 8000,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processVideos' && !isProcessing) {
        videoQueue = message.urls.map((url) => ({ url, title: 'Unknown' }));
        currentIndex = 0;
        results = [];
        isProcessing = true;

        chrome.storage.local.set({
            isRunning: true,
            totalVideos: videoQueue.length,
            currentIndex: 0,
            transcripts: [],
            progressText: '',
        });

        updatePopupProgress(`Starting to scrape ${videoQueue.length} videos...`);
        processNextVideo();
    }

    if (message.action === 'transcriptResult') {
        const { videoUrl, result } = message;
        results.push(result);
        chrome.storage.local.set({
            currentIndex: results.length,
            transcripts: results,
            isRunning: results.length < videoQueue.length,
        });
        updatePopupProgress(
            `Processed ${results.length}/${videoQueue.length}: ${result.title || videoUrl}`
        );

        // Close the tab that sent this message
        if (sender.tab && sender.tab.id) {
            chrome.tabs.remove(sender.tab.id, () => {
                if (chrome.runtime.lastError) {
                    console.warn(`Could not close tab: ${chrome.runtime.lastError.message}`);
                }
            });
        }
        // Move to next video after a short delay
        setTimeout(processNextVideo, 2000);
    }

    if (message.action === 'progressUpdate') {
        chrome.storage.local.set({ progressText: message.text });
        updatePopupProgress(message.text);
    }
});

function processNextVideo() {
    if (currentIndex >= videoQueue.length) {
        isProcessing = false;
        updatePopupProgress('All videos processed!', true, results);
        chrome.storage.local.set({ isRunning: false, progressText: '' });
        return;
    }

    const video = videoQueue[currentIndex];
    currentIndex++;
    updatePopupProgress(`[${currentIndex}/${videoQueue.length}] Opening: ${video.url}`);

    chrome.tabs.create({ url: video.url, active: false }, (tab) => {
        if (chrome.runtime.lastError) {
            results.push({
                url: video.url,
                error: `Tab create failed: ${chrome.runtime.lastError.message}`,
            });
            setTimeout(processNextVideo, 2000);
            return;
        }

        const timeoutId = setTimeout(() => {
            // Outer timeout: if the tab never finishes, close it and move on
            chrome.tabs.remove(tab.id, () => {
                results.push({ url: video.url, error: 'Timeout – page did not respond within 90s' });
                updatePopupProgress(`[${results.length}/${videoQueue.length}] Timeout on ${video.url}`);
                setTimeout(processNextVideo, 2000);
            });
        }, CONFIG.TAB_TIMEOUT_MS);

        const onUpdated = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                chrome.scripting
                    .executeScript({
                        target: { tabId: tab.id },
                        func: extractTranscriptFromDOM,
                        args: [video.url, CONFIG],
                    })
                    .catch((err) => {
                        clearTimeout(timeoutId);
                        chrome.tabs.remove(tab.id, () => {});
                        results.push({
                            url: video.url,
                            error: `Script injection failed: ${err.message}`,
                        });
                        setTimeout(processNextVideo, 2000);
                    });
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

// ---------- This function runs inside the video tab ----------
function extractTranscriptFromDOM(videoUrl, config) {
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
            const playerMatch = document.documentElement.innerHTML.match(
                /ytInitialPlayerResponse\s*=\s*({.+?})\s*;/s
            );
            if (playerMatch) {
                const player = JSON.parse(playerMatch[1]);
                title = player.videoDetails?.title || title;
                duration = parseInt(player.videoDetails?.lengthSeconds, 10) || 0;
            }
        } catch (e) {}
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
            .filter(Boolean)
            .join(':');
    }

    function findElementInShadow(selector, root = document) {
        let el = root.querySelector(selector);
        if (el) return el;
        const elements = root.querySelectorAll('*');
        for (const elem of elements) {
            if (elem.shadowRoot) {
                const found = findElementInShadow(selector, elem.shadowRoot);
                if (found) return found;
            }
        }
        return null;
    }

    async function clickTranscriptButton() {
        const directSelectors = [
            'button[aria-label*="Transcript" i]',
            'button[aria-label*="transcript" i]',
            'button[aria-label*="转写文稿" i]',
            'button[aria-label*="Show transcript" i]',
        ];
        for (const sel of directSelectors) {
            const btn = findElementInShadow(sel);
            if (btn) {
                btn.click();
                return true;
            }
        }

        const moreBtn = findElementInShadow(
            'button[aria-label="More actions"], button[aria-label*="more" i]'
        );
        if (moreBtn) {
            moreBtn.click();
            await new Promise((r) => setTimeout(r, 1500));
            const menu = findElementInShadow('ytd-menu-popup-renderer, div[role="menu"]');
            if (menu) {
                const option = Array.from(menu.querySelectorAll('*')).find(
                    (el) =>
                        el.textContent &&
                        (el.textContent.includes('Transcript') ||
                            el.textContent.includes('转写文稿'))
                );
                if (option) {
                    option.click();
                    return true;
                }
            }
        }
        return false;
    }

    // Safety timeout: if extraction takes too long, send error and close
    safetyTimeout = setTimeout(() => {
        sendFinalResult('', 'Extraction timeout after 60 seconds');
    }, config.INJECTED_TIMEOUT_MS);

    setTimeout(async () => {
        sendProgress(`[DOM] Loading page: ${videoUrl}`);
        await new Promise((r) => setTimeout(r, 3000));

        const clicked = await clickTranscriptButton();
        if (!clicked) {
            sendFinalResult('', 'Transcript button not found');
            return;
        }
        sendProgress(`[DOM] Button clicked, waiting for panel...`);

        // Wait for any panel that contains transcript text
        let panel = null;
        let startTime = Date.now();
        while (!panel && Date.now() - startTime < config.PANEL_WAIT_MS) {
            // Try all possible panel selectors for both formats
            const selectors = [
                '#segments-container',                                     // old format
                'ytd-transcript-segment-list-renderer',                    // old format container
                'ytd-transcript-renderer',                                 // old format wrapper
                'yt-section-list-renderer[data-target-id*="transcript"]', // new format container
                'yt-section-list-renderer[data-target-id*="modern_transcript"]',
                '[data-target-id*="transcript"]',
            ];
            for (const sel of selectors) {
                const el = findElementInShadow(sel);
                if (el) {
                    panel = el;
                    break;
                }
            }
            if (!panel) {
                await new Promise((r) => setTimeout(r, 500));
            }
        }

        if (!panel) {
            sendFinalResult('', 'Transcript panel did not appear');
            return;
        }
        sendProgress(`[DOM] Panel appeared, detecting format...`);

        // Detect format
        const oldSegments = panel.querySelectorAll('ytd-transcript-segment-renderer');
        const newSegments = panel.querySelectorAll('transcript-segment-view-model');

        let transcript = '';
        let segmentCount = 0;

        if (oldSegments.length > 0) {
            sendProgress(`[DOM] Old format (${oldSegments.length} segments found)`);
            // Scroll to load all (if scrollable)
            let prevCount = 0;
            for (let i = 0; i < config.SCROLL_ATTEMPTS; i++) {
                const segs = panel.querySelectorAll('ytd-transcript-segment-renderer');
                segmentCount = segs.length;
                if (segmentCount === prevCount && prevCount > 0) break;
                prevCount = segmentCount;
                if (panel.scrollHeight > panel.clientHeight) {
                    panel.scrollTop = panel.scrollHeight;
                    await new Promise((r) => setTimeout(r, 800));
                } else {
                    break;
                }
                sendProgress(`[DOM] Loaded ${segmentCount} old segments...`);
            }
            const allSegments = panel.querySelectorAll('ytd-transcript-segment-renderer');
            transcript = Array.from(allSegments)
                .map((seg) => {
                    const textEl = seg.querySelector('yt-formatted-string');
                    return textEl ? textEl.innerText.trim() : '';
                })
                .filter((t) => t)
                .join(' ');
        } else if (newSegments.length > 0) {
            sendProgress(`[DOM] New format (${newSegments.length} segments found)`);
            // Scroll the scrollable container
            const scrollContainer = panel.closest('[scrollable]') || panel;
            let prevCount = 0;
            for (let i = 0; i < config.SCROLL_ATTEMPTS; i++) {
                const segs = panel.querySelectorAll('transcript-segment-view-model');
                segmentCount = segs.length;
                if (segmentCount === prevCount && prevCount > 0) break;
                prevCount = segmentCount;
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                await new Promise((r) => setTimeout(r, 800));
                sendProgress(`[DOM] Loaded ${segmentCount} new segments...`);
            }
            const allSegments = panel.querySelectorAll('transcript-segment-view-model');
            transcript = Array.from(allSegments)
                .map((seg) => {
                    const textSpan = seg.querySelector('span.yt-core-attributed-string');
                    if (textSpan) return textSpan.innerText.trim();
                    return seg.innerText.trim();
                })
                .filter((t) => t)
                .join(' ');
        } else {
            // Fallback: get all text from panel
            sendProgress(`[DOM] Unknown format, using innerText fallback`);
            transcript = panel.innerText;
        }

        // Clean timestamps and extra spaces
        transcript = transcript.replace(/\b\d+:\d+\s*/g, '').replace(/\s+/g, ' ').trim();

        if (transcript.length > 50) {
            sendProgress(`[DOM] Success! ${transcript.length} chars from ${segmentCount} segments`);
            sendFinalResult(transcript, null);
        } else {
            sendFinalResult('', `Transcript too short (${transcript.length} chars)`);
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