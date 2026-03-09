---
description: Process pending Xhoard bookmarks
agent: build
---

Read `./.state/pending-bookmarks.json` and process every bookmark.

For each bookmark:
- Create a concise, descriptive title.
- Preserve useful context from tweet text, linked content, quote tweets, and reply context.
- Write one markdown file per bookmark under `./bookmarks/YYYY-MM-DD/<tweet-id>.md`.
- If category is `github`, write a detailed knowledge note in `./knowledge/tools/`.
- If category is `article` or `x-article`, write a detailed knowledge note in `./knowledge/articles/`.
- Keep frontmatter and formatting consistent with existing files.

Rules:
- Avoid generic summaries like "Interesting thread" or "Tool link".
- If a bookmark already has a file, update it instead of duplicating.
- Keep links stable and include original tweet URLs.
- Do not skip bookmarks unless data is missing; if missing, state why in output.

When done, report a brief summary with counts of processed bookmarks and written/updated files.
