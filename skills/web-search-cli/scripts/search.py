#!/usr/bin/env python3
import sys
import urllib.request
import urllib.parse
import re

def search(query, limit=10):
    url = 'https://lite.duckduckgo.com/lite/'
    data = urllib.parse.urlencode({'q': query}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})

    try:
        with urllib.request.urlopen(req) as resp:
            html = resp.read().decode('utf-8')
            links = re.findall(r'<a[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>', html)
            results = []
            for href, text in links:
                clean_text = re.sub(r'<[^>]+>', '', text).strip()
                actual_url = href
                if 'uddg=' in href:
                    parsed_url = urllib.parse.urlparse(href)
                    qs = urllib.parse.parse_qs(parsed_url.query)
                    if 'uddg' in qs:
                        actual_url = qs['uddg'][0]

                if actual_url.startswith('http') and clean_text and 'duckduckgo' not in actual_url:
                    results.append((clean_text, actual_url))

            seen = set()
            unique_results = []
            for title, link in results:
                if link not in seen:
                    seen.add(link)
                    unique_results.append((title, link))

            return unique_results[:limit]
    except Exception as e:
        print(f"Error performing search: {e}", file=sys.stderr)
        return []

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 search.py \"your query here\"")
        sys.exit(1)

    query = ' '.join(sys.argv[1:])
    print(f"Searching for: {query}\n")
    results = search(query)
    for i, (title, link) in enumerate(results, 1):
        print(f"{i}. {title}\n   {link}\n")
