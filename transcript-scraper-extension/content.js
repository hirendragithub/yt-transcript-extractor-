chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrapeVideos') {
        const anchors = document.querySelectorAll('a[href*="/watch?v="]');
        const urls = new Set();
        anchors.forEach(a => {
            let href = a.href;
            if (href.startsWith('/')) href = 'https://www.youtube.com' + href;
            if (href.includes('watch?v=')) urls.add(href.split('&')[0]); // clean URL
        });
        sendResponse({ videoUrls: Array.from(urls) });
    }
});