# Backup Filter Options for GDELT False Positives

Saved 2026-03-28. Context: articles like `thecollegefix.com` campus divestment stories get geocoded to Israel with conflict CAMEO codes, passing geo-validation because FullName/FIPS agree.

## Option 1: Source Domain Scoring

Add a confidence signal that penalizes non-conflict source domains. Extract domain from `SOURCEURL` (column 60). Maintain a blocklist of campus news, opinion, domestic politics domains. Could also do inverse: a boost list for known conflict-reporting outlets (Reuters, AP, Al Jazeera, etc.).

**Pro:** Directly targets the problem — bad sources producing bad events.
**Con:** Requires maintaining a domain list. New domains constantly appear.

## Option 2: Minimum Mentions/Sources Floor

Require `NumMentions >= 3` or `NumSources >= 2` before an event enters the pipeline. Single-source, low-mention events are overwhelmingly noise.

**Pro:** Simple, zero maintenance, catches a huge chunk of noise.
**Con:** Blunt instrument. Some legitimate breaking events start with 1-2 mentions before growing. Could add a delay for real events to appear.

**Possible hybrid:** Don't hard-filter, but add minimum mentions as a confidence signal weight.
