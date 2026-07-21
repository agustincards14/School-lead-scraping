# Statpad School Leads & Outbound Automation

## Overview

This project powers the automated B2B lead generation and outbound marketing pipeline for **Statpad**, a next-generation soccer stats and analytics platform. 

The primary purpose of this toolset is to automate large-scale lead discovery, extraction, data cleaning, and personalized outreach targeting athletic directors, head soccer coaches, and athletic staff across high schools and colleges nationwide.

---

## Workflow Architecture

1. **Automated Lead Collection**: Large-scale web scraping across state high school athletic associations and college athletic directories.
2. **Data Structuring**: Parsing and converting raw web data into clean, structured CSV format.
3. **Cleaning & Normalization**: Deduplicating records, standardizing names and phone numbers, and predicting/verifying email formats.
4. **Google Sheets Import**: Loading sanitized contact datasets into Google Sheets for campaign tracking and data management.
5. **Automated Outreach via Google Apps Script**: Running custom Google Apps Script automation directly on the contact list to execute bulk email campaigns.
6. **Tailored Design & Messaging**: Delivering custom-designed HTML/CSS email templates with dynamic variable insertion (school name, mascot, recipient role) and inline image assets.

---

## Tools & Frameworks

* **Web Scraping & Automation**: Playwright, Node.js, TypeScript
* **Data Processing**: Custom Node.js & TypeScript normalization scripts, CSV parser modules
* **AI & Email Prediction**: Google Gemini API (`@google/genai`)
* **Outreach & Automation**: Google Apps Script, Gmail API, Google Drive API
* **Email Design**: Responsive HTML & Vanilla CSS templates

---

## Business Impact & ROI

Automating this complete pipeline—from web discovery to personalized inbox delivery—provided significant operational and financial savings for the startup:

* **Time Saved**: Estimated **250+ hours** of manual web research, copying/pasting, list cleaning, and individual email drafting.
* **Cost Saved**: Estimated **$5,000 – $8,000+** saved compared to hiring data-entry freelancers, purchasing static lead lists, or subscribing to enterprise sales intelligence tools.
