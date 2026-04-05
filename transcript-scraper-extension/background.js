// ============================================================
// YouTube Transcript Scraper - Ultimate Robust Version
// ============================================================

let videoQueue = [];
let currentIndex = 0;
let results = [];
let isProcessing = false;
let isWaitingForTabClose = false;

const CONFIG = {
    TAB_TIMEOUT_MS: 120000,
    INJECTED_TIMEOUT_MS: 90000,
    PANEL_WAIT_MS: 45000,
    SCROLL_ATTEMPTS: 25,
    POST_LOAD_DELAY_MS: 10000,
    DELAY_BETWEEN_VIDEOS_MS: 2000,
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'processVideos' && !isProcessing && !isWaitingForTabClose) {
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
        
        const progressMsg = `Processed ${results.length}/${videoQueue.length}: ${result.title || videoUrl}`;
        updatePopupProgress(progressMsg);

        if (sender.tab && sender.tab.id) {
            chrome.tabs.remove(sender.tab.id, () => {
                if (chrome.runtime.lastError) console.warn("Tab close error");
                isWaitingForTabClose = false;
                setTimeout(processNextVideo, CONFIG.DELAY_BETWEEN_VIDEOS_MS);
            });
        } else {
            isWaitingForTabClose = false;
            setTimeout(processNextVideo, CONFIG.DELAY_BETWEEN_VIDEOS_MS);
        }
    }

    if (message.action === 'progressUpdate') {
        chrome.storage.local.set({ progressText: message.text });
        updatePopupProgress(message.text);
    }
});

function processNextVideo() {
    if (isWaitingForTabClose) return;

    if (currentIndex >= videoQueue.length) {
        isProcessing = false;
        isWaitingForTabClose = false;
        updatePopupProgress('All videos processed!', true, results);
        chrome.storage.local.set({ isRunning: false, progressText: '' });
        return;
    }

    const video = videoQueue[currentIndex];
    currentIndex++;
    isWaitingForTabClose = true;
    updatePopupProgress(`[${currentIndex}/${videoQueue.length}] Opening: ${video.url}`);

    chrome.tabs.create({ url: video.url, active: false }, (tab) => {
        if (chrome.runtime.lastError) {
            isWaitingForTabClose = false;
            results.push({ url: video.url, error: `Tab create failed: ${chrome.runtime.lastError.message}` });
            setTimeout(processNextVideo, CONFIG.DELAY_BETWEEN_VIDEOS_MS);
            return;
        }

        const timeoutId = setTimeout(() => {
            chrome.tabs.remove(tab.id, () => {
                isWaitingForTabClose = false;
                results.push({ url: video.url, error: `Timeout – page did not respond within ${CONFIG.TAB_TIMEOUT_MS/1000}s` });
                updatePopupProgress(`Timeout on ${video.url}`);
                setTimeout(processNextVideo, CONFIG.DELAY_BETWEEN_VIDEOS_MS);
            });
        }, CONFIG.TAB_TIMEOUT_MS);

        const onUpdated = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: extractTranscriptFromDOM,
                    args: [video.url, CONFIG],
                }).catch((err) => {
                    clearTimeout(timeoutId);
                    chrome.tabs.remove(tab.id, () => {
                        isWaitingForTabClose = false;
                        results.push({ url: video.url, error: `Script injection failed: ${err.message}` });
                        setTimeout(processNextVideo, CONFIG.DELAY_BETWEEN_VIDEOS_MS);
                    });
                });
            }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}

// ---------- Injected function ----------
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
            const playerMatch = document.documentElement.innerHTML.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/s);
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
        return [h > 0 ? h.toString().padStart(2, '0') : null, m.toString().padStart(2, '0'), s.toString().padStart(2, '0')].filter(Boolean).join(':');
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
        // Direct transcript buttons (various labels)
        const directSelectors = [
            'button[aria-label*="Transcript" i]',
            'button[aria-label*="transcript" i]',
            'button[aria-label*="转写文稿" i]',
            'button[aria-label*="Show transcript" i]',
            'button[aria-label*="显示转录文字" i]',
        ];
        for (const sel of directSelectors) {
            const btn = findElementInShadow(sel);
            if (btn) {
                sendProgress(`Found direct transcript button, clicking`);
                btn.click();
                return true;
            }
        }

        // Try the "More actions" menu (three dots below video)
        const moreBtnSelectors = [
            'button[aria-label="More actions"]',
            'button[aria-label*="more" i]',
            'button[aria-label="更多操作"]',
            '#button-shape button[aria-label="More actions"]'
        ];
        let moreBtn = null;
        for (const sel of moreBtnSelectors) {
            moreBtn = findElementInShadow(sel);
            if (moreBtn) break;
        }
        if (moreBtn) {
            sendProgress(`Clicking "More actions" button`);
            moreBtn.click();
            await new Promise(r => setTimeout(r, 2000));
            const menu = findElementInShadow('ytd-menu-popup-renderer, div[role="menu"], tp-yt-paper-menu');
            if (menu) {
                const option = Array.from(menu.querySelectorAll('*')).find(el => 
                    el.textContent && 
                    (el.textContent.includes('Transcript') || 
                     el.textContent.includes('转写文稿') ||
                     el.textContent.includes('显示转录文字'))
                );
                if (option) {
                    sendProgress(`Found transcript option in menu, clicking`);
                    option.click();
                    return true;
                }
            }
        }

        // Fallback: Try clicking the "..." button inside the description (for some videos)
        const descMoreBtn = findElementInShadow('#expand-button, #more-button, button[aria-label="更多"]');
        if (descMoreBtn) {
            sendProgress(`Trying description "more" button`);
            descMoreBtn.click();
            await new Promise(r => setTimeout(r, 1500));
            // Look for transcript link in expanded description
            const transcriptLink = Array.from(document.querySelectorAll('a, button')).find(el => 
                el.textContent && (el.textContent.includes('Transcript') || el.textContent.includes('转写文稿'))
            );
            if (transcriptLink) {
                transcriptLink.click();
                return true;
            }
        }

        return false;
    }

    // Fallback: Try to get transcript directly from API (caption tracks)
    async function tryApiFallback() {
        sendProgress(`Trying API fallback for transcript...`);
        try {
            const playerMatch = document.documentElement.innerHTML.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/s);
            if (!playerMatch) return false;
            const player = JSON.parse(playerMatch[1]);
            const tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
            if (tracks.length === 0) return false;
            let track = tracks.find(t => t.languageCode === 'en') || tracks[0];
            let trackUrl = track.baseUrl;
            if (!trackUrl.includes('fmt=')) trackUrl += (trackUrl.includes('?') ? '&' : '?') + 'fmt=json3';
            const response = await fetch(trackUrl);
            const data = await response.text();
            let transcript = '';
            if (data.trim().startsWith('{')) {
                const json = JSON.parse(data);
                if (json.events) {
                    transcript = json.events.filter(e => e.segs).map(e => e.segs.map(seg => seg.utf8).join(' ')).join(' ');
                }
            } else {
                const matches = data.match(/<text[^>]*>([\s\S]*?)<\/text>/g);
                if (matches) transcript = matches.map(t => t.replace(/<[^>]*>/g, '')).join(' ');
            }
            transcript = transcript.replace(/\b\d+:\d+\s*/g, '').replace(/\s+/g, ' ').trim();
            if (transcript.length > 50) {
                sendProgress(`API fallback succeeded (${transcript.length} chars)`);
                sendFinalResult(transcript, null);
                return true;
            }
        } catch(e) { console.warn(e); }
        return false;
    }

    safetyTimeout = setTimeout(() => sendFinalResult('', 'Extraction timeout after 90 seconds'), config.INJECTED_TIMEOUT_MS);

    setTimeout(async () => {
        sendProgress(`Page loaded, searching for transcript button...`);
        await new Promise(r => setTimeout(r, 4000));
        
        const clicked = await clickTranscriptButton();
        if (!clicked) {
            sendProgress(`No transcript button found, trying API fallback...`);
            const apiSuccess = await tryApiFallback();
            if (!apiSuccess) {
                sendFinalResult('', 'Transcript button not found and API fallback failed');
            }
            return;
        }
        
        sendProgress(`Button clicked, waiting for transcript panel...`);

        // Wait for panel using multiple selectors (including new format)
        let panel = null;
        let startTime = Date.now();
        while (!panel && Date.now() - startTime < config.PANEL_WAIT_MS) {
            const selectors = [
                '#segments-container',
                'ytd-transcript-segment-list-renderer',
                'ytd-transcript-renderer',
                'yt-section-list-renderer[data-target-id*="transcript"]',
                'yt-section-list-renderer[data-target-id*="modern_transcript"]',
                'div#content.ytd-engagement-panel-section-list-renderer',
                'ytd-engagement-panel-section-list-renderer'
            ];
            for (const sel of selectors) {
                const el = findElementInShadow(sel);
                if (el && (el.querySelectorAll('ytd-transcript-segment-renderer, transcript-segment-view-model').length > 0 || el.innerText.trim().length > 100)) {
                    panel = el;
                    break;
                }
            }
            if (!panel) await new Promise(r => setTimeout(r, 500));
        }

        if (!panel) {
            sendProgress(`Panel did not appear, trying API fallback...`);
            const apiSuccess = await tryApiFallback();
            if (!apiSuccess) {
                sendFinalResult('', 'Transcript panel did not appear and API fallback failed');
            }
            return;
        }

        sendProgress(`Panel appeared, extracting transcript...`);

        const oldSegments = panel.querySelectorAll('ytd-transcript-segment-renderer');
        const newSegments = panel.querySelectorAll('transcript-segment-view-model');
        let transcript = '';
        let segmentCount = 0;

        if (oldSegments.length > 0) {
            sendProgress(`Old format detected (${oldSegments.length} segments)`);
            let prevCount = 0;
            for (let i = 0; i < config.SCROLL_ATTEMPTS; i++) {
                const segs = panel.querySelectorAll('ytd-transcript-segment-renderer');
                segmentCount = segs.length;
                if (segmentCount === prevCount && prevCount > 0) break;
                prevCount = segmentCount;
                if (panel.scrollHeight > panel.clientHeight) panel.scrollTop = panel.scrollHeight;
                await new Promise(r => setTimeout(r, 800));
                sendProgress(`Loaded ${segmentCount} segments...`);
            }
            transcript = Array.from(panel.querySelectorAll('ytd-transcript-segment-renderer'))
                .map(seg => seg.querySelector('yt-formatted-string')?.innerText || '')
                .filter(t => t).join(' ');
        } else if (newSegments.length > 0) {
            sendProgress(`New format detected (${newSegments.length} segments)`);
            const scrollContainer = panel.closest('[scrollable]') || panel;
            let prevCount = 0;
            for (let i = 0; i < config.SCROLL_ATTEMPTS; i++) {
                const segs = panel.querySelectorAll('transcript-segment-view-model');
                segmentCount = segs.length;
                if (segmentCount === prevCount && prevCount > 0) break;
                prevCount = segmentCount;
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
                await new Promise(r => setTimeout(r, 800));
                sendProgress(`Loaded ${segmentCount} segments...`);
            }
            transcript = Array.from(panel.querySelectorAll('transcript-segment-view-model'))
                .map(seg => seg.querySelector('span.yt-core-attributed-string')?.innerText || seg.innerText)
                .filter(t => t).join(' ');
        } else {
            sendProgress(`Unknown format, using innerText fallback`);
            transcript = panel.innerText;
        }

        transcript = transcript.replace(/\b\d+:\d+\s*/g, '').replace(/\s+/g, ' ').trim();
        if (transcript.length > 50) {
            sendProgress(`Success! Extracted ${transcript.length} chars`);
            sendFinalResult(transcript, null);
        } else {
            sendProgress(`Transcript too short (${transcript.length} chars), trying API fallback...`);
            const apiSuccess = await tryApiFallback();
            if (!apiSuccess) {
                sendFinalResult('', `Transcript too short (${transcript.length} chars)`);
            }
        }
    }, config.POST_LOAD_DELAY_MS);
}

function updatePopupProgress(text, complete = false, data = null) {
    chrome.runtime.sendMessage({ action: complete ? 'scrapeComplete' : 'updateProgress', text, data }).catch(() => {});
}