---
name: web-search-cli
description: "Search the web using DuckDuckGo Lite and Python via bash when native web search is unavailable. Use when searching the web, querying information, or looking up articles without browser extensions."
---

# Web Search CLI

When native model web search is unavailable or unsupported, search programmatically using the bundled Python script against DuckDuckGo Lite.

## Usage

Run the bundled script from this skill directory:

```bash
node scripts/run-search.mjs "your query here"
```

The launcher uses `python3` and then `python` on Unix-like systems. On Windows it tries
the Python launcher (`py -3`), then `python`, then `python3`, so the skill works with
standard Windows Python installs as well as Git Bash.

The script sends an HTTP POST request to DuckDuckGo Lite, extracts result titles and destination URLs, and removes DuckDuckGo redirect tracking parameters.

## Fetching Article Content

To read and summarize full text from a resulting URL, use Python's built-in `urllib` and regex to extract paragraph content:

```python
import re
import urllib.request

url = "https://example.com/article"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode("utf-8")
    paragraphs = re.findall(r"<p[^>]*>(.*?)</p>", html)
    text = " ".join(paragraphs)
    clean_text = re.sub(r"<[^>]+>", "", text)
    print(clean_text[:2000])
```
