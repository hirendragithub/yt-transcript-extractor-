# Content Creation Folder Structure

## Overview
This folder structure is designed for **solo content creators** to organize ideas, production assets, post-production files, publishing data, analytics, and brand resources in a **single root folder**.  
It follows a **workflow-oriented approach**, from ideation → production → publishing → analytics.  
All content is stored under one root folder for simplicity and portability.

## Root Folder: `Content_Creation`

### Visual Folder Tree

Content_Creation/
├── 01_Ideas_Research/
│   ├── Idea_Backlog/
│   ├── Trends/
│   ├── Competitor_Analysis/
│   ├── Scripts_Drafts/
│   └── Swipe_Files/
├── 02_Content_Pipeline/
│   ├── To_Do/
│   ├── In_Progress/
│   ├── Review/
│   └── Scheduled/
├── 03_Production/
│   ├── Raw_Footage/
│   ├── Audio/
│   ├── Screen_Recordings/
│   ├── B_Roll/
│   └── Project_Files/
├── 04_Post_Production/
│   ├── Drafts/
│   ├── Final_Exports/
│   ├── Shorts_Reels/
│   └── Thumbnails/
├── 05_Publishing/
│   ├── YouTube/
│   │   ├── Titles_Descriptions/
│   │   └── Upload_Checklists/
│   ├── Instagram/
│   ├── TikTok/
│   └── Blog/
├── 06_Analytics/
│   ├── Monthly_Reports/
│   ├── KPIs/
│   └── A_B_Tests/
├── 07_Brand_Assets/
│   ├── Logos/
│   ├── Fonts/
│   ├── Color_Palette/
│   ├── Templates/
│   └── Music_SFX/
├── 08_Admin_Business/
│   ├── Sponsorships/
│   ├── Contracts/
│   ├── Invoices/
│   ├── Outreach/
│   └── Content_Calendar/
└── 09_Repurposing/
    ├── Longform_to_Shorts/
    ├── Clips/
    └── Quotes_Text/

## Folder Breakdown

**01_Ideas_Research** – Stores raw ideas, research, and planning resources: Idea_Backlog, Trends, Competitor_Analysis, Scripts_Drafts, Swipe_Files.  
**02_Content_Pipeline** – Organizes content based on production status: To_Do, In_Progress, Review, Scheduled.  
**03_Production** – Raw media files: Raw_Footage, Audio, Screen_Recordings, B_Roll, Project_Files.  
**04_Post_Production** – Edited content and derivatives: Drafts, Final_Exports, Shorts_Reels, Thumbnails.  
**05_Publishing** – Platform-ready content and metadata for YouTube, Instagram, TikTok, Blog.  
**06_Analytics** – Tracks performance: Monthly_Reports, KPIs, A_B_Tests.  
**07_Brand_Assets** – Reusable brand elements: Logos, Fonts, Color_Palette, Templates, Music_SFX.  
**08_Admin_Business** – Business organization: Sponsorships, Contracts, Invoices, Outreach, Content_Calendar.  
**09_Repurposing** – Derivative content: Longform_to_Shorts, Clips, Quotes_Text.

## Folder Naming Convention
Use sortable names:

YYYY-MM-DD_Platform_ContentType_Title_Version

Example:

2026-04-06_YT_Video_How-to-Grow-V1.mp4

## Cross-Platform Folder Creation Scripts

### Windows (PowerShell)
$root = "Content_Creation"
$folders = @(
"01_Ideas_Research/Idea_Backlog","01_Ideas_Research/Trends","01_Ideas_Research/Competitor_Analysis","01_Ideas_Research/Scripts_Drafts","01_Ideas_Research/Swipe_Files",
"02_Content_Pipeline/To_Do","02_Content_Pipeline/In_Progress","02_Content_Pipeline/Review","02_Content_Pipeline/Scheduled",
"03_Production/Raw_Footage","03_Production/Audio","03_Production/Screen_Recordings","03_Production/B_Roll","03_Production/Project_Files",
"04_Post_Production/Drafts","04_Post_Production/Final_Exports","04_Post_Production/Shorts_Reels","04_Post_Production/Thumbnails",
"05_Publishing/YouTube/Titles_Descriptions","05_Publishing/YouTube/Upload_Checklists","05_Publishing/Instagram","05_Publishing/TikTok","05_Publishing/Blog",
"06_Analytics/Monthly_Reports","06_Analytics/KPIs","06_Analytics/A_B_Tests",
"07_Brand_Assets/Logos","07_Brand_Assets/Fonts","07_Brand_Assets/Color_Palette","07_Brand_Assets/Templates","07_Brand_Assets/Music_SFX",
"08_Admin_Business/Sponsorships","08_Admin_Business/Contracts","08_Admin_Business/Invoices","08_Admin_Business/Outreach","08_Admin_Business/Content_Calendar",
"09_Repurposing/Longform_to_Shorts","09_Repurposing/Clips","09_Repurposing/Quotes_Text"
)
foreach ($folder in $folders) {
    New-Item -ItemType Directory -Path (Join-Path $root $folder) -Force | Out-Null
}
Write-Host "Folder structure created successfully under '$root'"

### macOS / Linux (Bash)
#!/bin/bash
root="Content_Creation"
folders=(
"01_Ideas_Research/Idea_Backlog" "01_Ideas_Research/Trends" "01_Ideas_Research/Competitor_Analysis" "01_Ideas_Research/Scripts_Drafts" "01_Ideas_Research/Swipe_Files"
"02_Content_Pipeline/To_Do" "02_Content_Pipeline/In_Progress" "02_Content_Pipeline/Review" "02_Content_Pipeline/Scheduled"
"03_Production/Raw_Footage" "03_Production/Audio" "03_Production/Screen_Recordings" "03_Production/B_Roll" "03_Production/Project_Files"
"04_Post_Production/Drafts" "04_Post_Production/Final_Exports" "04_Post_Production/Shorts_Reels" "04_Post_Production/Thumbnails"
"05_Publishing/YouTube/Titles_Descriptions" "05_Publishing/YouTube/Upload_Checklists" "05_Publishing/Instagram" "05_Publishing/TikTok" "05_Publishing/Blog"
"06_Analytics/Monthly_Reports" "06_Analytics/KPIs" "06_Analytics/A_B_Tests"
"07_Brand_Assets/Logos" "07_Brand_Assets/Fonts" "07_Brand_Assets/Color_Palette" "07_Brand_Assets/Templates" "07_Brand_Assets/Music_SFX"
"08_Admin_Business/Sponsorships" "08_Admin_Business/Contracts" "08_Admin_Business/Invoices" "08_Admin_Business/Outreach" "08_Admin_Business/Content_Calendar"
"09_Repurposing/Longform_to_Shorts" "09_Repurposing/Clips" "09_Repurposing/Quotes_Text"
)
for folder in "${folders[@]}"; do
    mkdir -p "$root/$folder"
done
echo "Folder structure created successfully under '$root'"

---

✅ This setup ensures your content workflow is **organized, single-folder, scalable, and cross-platform ready**.
