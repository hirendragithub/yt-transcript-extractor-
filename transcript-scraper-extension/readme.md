\# Video Transcript Scraper - Chrome Extension



A powerful Chrome extension that automatically scrapes transcripts from videos on any webpage. Perfect for extracting captions from YouTube videos, course platforms, and any HTML5 video content.



\## Features



\### 🎯 Core Features

\- \*\*Auto-detect Videos\*\*: Automatically finds all video elements on the current page

\- \*\*YouTube Support\*\*: Extracts both manual and auto-generated captions from YouTube videos

\- \*\*Generic Video Support\*\*: Works with standard HTML5 video elements that have caption tracks

\- \*\*Start/Stop Control\*\*: Start and stop scraping at any time

\- \*\*Real-time Progress\*\*: Shows current status, video being processed, and completion percentage



\### 📊 Export Formats

\- \*\*JSON\*\*: Complete structured data including metadata and transcripts

\- \*\*CSV\*\*: Spreadsheet-friendly format for data analysis

\- \*\*TXT\*\*: Human-readable text format with clear section separation



\### 📝 Data Fields

Each video record includes:

\- `url`: Full URL of the video

\- `id`: Unique identifier (video ID for YouTube)

\- `title`: Video title extracted from the page

\- `transcript`: Full transcript text (when available)

\- `transcript\_error`: Error type if transcript couldn't be retrieved



\## Installation



\### From Source (Developer Mode)

1\. Download or clone this repository

2\. Open Chrome and navigate to `chrome://extensions/`

3\. Enable "Developer mode" (toggle in top-right corner)

4\. Click "Load unpacked"

5\. Select the folder containing the extension files

6\. The extension icon will appear in your Chrome toolbar



\### Create Icons (Optional)

Create three icon files in an `icons` folder:

\- `icon16.png` (16x16 pixels)

\- `icon48.png` (48x48 pixels)

\- `icon128.png` (128x128 pixels)



\## How to Use



\### Basic Usage

1\. Navigate to a page containing videos (e.g., YouTube playlist, course page)

2\. Click the extension icon in your Chrome toolbar

3\. Click the \*\*Start\*\* button to begin scraping

4\. Watch the progress as transcripts are extracted

5\. Click \*\*Stop\*\* at any time to cancel the operation

6\. Once complete, download results in your preferred format



\### Supported Pages



\#### YouTube

\- Playlist pages

\- Channel video listings

\- Search results

\- Any page with YouTube video links



\#### Other Websites

\- Pages with `<video>` HTML5 elements

\- Educational platforms with video captions

\- Any site using standard video players with text tracks



\### Tips for Best Results

\- \*\*No scrolling needed\*\*: Only processes videos currently loaded in the DOM

\- \*\*YouTube videos\*\*: Works best with public videos that have captions enabled

\- \*\*Generic videos\*\*: Requires videos to have built-in caption tracks

\- \*\*Large pages\*\*: For pages with many videos, the process may take some time

\- \*\*Stop functionality\*\*: Use the stop button to cancel long-running operations



\## Troubleshooting



\### Common Issues



\*\*No videos found\*\*

\- Ensure the page has loaded completely

\- Refresh the page and try again

\- Check if videos are actually present on the page



\*\*Transcript not available\*\*

\- YouTube videos must have captions enabled

\- Generic videos need embedded caption tracks

\- Some videos may have disabled transcript access



\*\*Extension not working\*\*

\- Reload the page

\- Click the extension icon again

\- Check if you're on a supported page type



\## Technical Details



\### How It Works

1\. Content script scans the page for video elements and links

2\. For YouTube: Extracts video IDs and fetches captions via YouTube's API

3\. For generic videos: Accesses HTML5 video text tracks

4\. Progress is reported in real-time to the popup

5\. Results are stored and available for download in multiple formats



\### Permissions Explained

\- `activeTab`: Access to the current tab only when extension is used

\- `storage`: Store temporary scraping results

\- `downloads`: Save transcript files to your computer

\- `host\_permissions`: Access video data from websites



\## Privacy \& Security

\- No data is sent to external servers

\- All processing happens locally in your browser

\- Transcripts never leave your computer unless you save them

\- Works offline for local video files with captions



\## Version History



\### v1.0

\- Initial release

\- YouTube transcript extraction

\- Generic video support

\- JSON, CSV, TXT export

\- Real-time progress tracking

\- Start/Stop controls



\## License

MIT License - Free for personal and commercial use



\## Support

For issues or feature requests, please create an issue in the repository.



\---



\*\*Enjoy effortless video transcript extraction!\*\* 🎥📝


