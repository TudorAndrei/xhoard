# Xhoard

Archive your Twitter/X bookmarks (and/or optionally, likes) to markdown. Automatically.

Xhoard collects the valuable things you bookmark and like.

> **Multi-model support:** Xhoard runs through [OpenCode](https://github.com/opencode-ai/opencode) using the OpenCode SDK, so you can pick any model available in your OpenCode setup.

## Contents

- [Quick Start](#quick-start-5-minutes)
- [Getting Twitter Credentials](#getting-twitter-credentials)
- [What It Does](#what-it-does)
- [Running](#running)
- [Categories](#categories)
- [Automation](#automation)
- [Output](#output)
- [Configuration](#configuration)
- [OpenCode SDK Integration](#opencode-sdk-integration)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)

## Quick Start (5 minutes)

### Option 1: Using bunx (Recommended for CI/GitHub Actions)

No installation needed! Works great in GitHub Actions:

```bash
# Fetch bookmarks immediately (creates files in bookmarks/)
bunx xhoard fetch

# Run with environment variables
AUTH_TOKEN=xxx CT0=xxx bunx xhoard fetch

# Process with OpenCode
bunx xhoard run

# Full job with all options
AUTH_TOKEN=$AUTH_TOKEN CT0=$CT0 bunx xhoard run
```

### Option 2: Local Installation

```bash
# 1. Install bird CLI (Twitter API wrapper)
# See https://github.com/steipete/bird for installation

# 2. Clone and install Xhoard
git clone https://github.com/TudorAndrei/xhoard
cd xhoard
npm install

# 3. Run the setup wizard
npx xhoard setup

# 4. Run the full job (fetch + process with OpenCode)
npx xhoard run
```

The setup wizard will:
- Create required directories
- Guide you through getting Twitter credentials
- Create your config file

## Manually Getting Twitter Credentials

Xhoard uses the bird CLI which needs your Twitter session cookies.

If you don't want to use the wizard to make it easy, you can manually put your session info into the config.

1. Copy the example config:
   ```bash
   cp xhoard.config.example.json xhoard.config.json
   ```
2. Open Twitter/X in your browser
3. Open Developer Tools → Application → Cookies
4. Find and copy these values:
   - `auth_token`
   - `ct0`
5. Add them to your `xhoard.config.json`:

```json
{
  "twitter": {
    "authToken": "your_auth_token_here",
    "ct0": "your_ct0_here"
  }
}
```

> **Note:** `xhoard.config.json` is gitignored to prevent accidentally committing credentials. The example file is tracked instead.

## What Xhoard Actually Does

1. **Fetches bookmarks** from Twitter/X using the bird CLI (can also fetch likes, or both)
2. **Expands t.co links** to reveal actual URLs
3. **Extracts content** from linked pages:
   - GitHub repos (via API: stars, description, README)
   - External articles (title, author, content)
   - X/Twitter long-form articles (full content via bird CLI)
   - Quote tweets and reply threads (full context)
4. **Invokes OpenCode** to analyze and categorize each tweet
5. **Saves to markdown** as one file per bookmark (organized by date folders)
6. **Files to knowledge library** - GitHub repos to `knowledge/tools/`, articles to `knowledge/articles/`

## Running Manually

```bash
# Full job (fetch + process with OpenCode)
npx xhoard run

# Fetch from bookmarks (default)
npx xhoard fetch 20

# Fetch ALL bookmarks (paginated - requires bird CLI from git)
npx xhoard fetch --all
npx xhoard fetch --all --max-pages 5  # Limit to 5 pages

# Fetch from likes instead
npx xhoard fetch --source likes

# Fetch from both bookmarks AND likes
npx xhoard fetch --source both

# Process already-fetched tweets
npx xhoard process

# Force re-process (ignore duplicates)
npx xhoard process --force

# Check what's pending
node -e "console.log(require('./.state/pending-bookmarks.json').count)"
```

### Fetching All Bookmarks

By default, Twitter's API returns ~50-70 bookmarks per request. To fetch more, use the `--all` flag which enables pagination:

```bash
npx xhoard fetch --all              # Fetch all (up to 10 pages)
npx xhoard fetch --all --max-pages 20  # Fetch up to 20 pages
```

**Note:** This requires bird CLI built from git (not the npm release). See [Troubleshooting](#troubleshooting) for installation instructions.

**Cost warning:** Processing large bookmark backlogs can consume significant model tokens. Each bookmark with content-heavy links (long articles, GitHub READMEs, etc.) adds to the context. Process in batches to control costs:

```bash
npx xhoard run --limit 50 -t    # Process 50 at a time with token tracking
```

Use the `-t` flag to monitor usage. See [Token Usage Tracking](#token-usage-tracking) for cost estimates by model.

## Categories

Categories define how different bookmark types are handled. Xhoard comes with sensible defaults, but you can customize them in `xhoard.config.json`.

### Default Categories

| Category | Matches | Action | Destination |
|----------|---------|--------|-------------|
| **github** | github.com | file | `./knowledge/tools/` |
| **article** | medium.com, substack.com, dev.to, blogs | file | `./knowledge/articles/` |
| **x-article** | x.com/i/article/* | file | `./knowledge/articles/` |
| **tweet** | (fallback) | capture | bookmark file only |

🔜 _Note: Transcription is flagged but not yet automated. PRs welcome!_

### X/Twitter Long-Form Articles

X articles (`x.com/i/article/*`) are Twitter's native long-form content format. Xhoard extracts the full article text using bird CLI:

1. **Direct extraction**: If the bookmarked tweet is the article author's original post, content is extracted directly
2. **Search fallback**: If you bookmark someone sharing/quoting an article, Xhoard searches for the original author's tweet and extracts the full content from there
3. **Metadata fallback**: If search fails, basic metadata (title, description) is captured

Example X article bookmark:
```markdown
## @joaomdmoura - Lessons From 2 Billion Agentic Workflows
> [Full article content extracted]

- **Tweet:** https://x.com/joaomdmoura/status/123456789
- **Link:** https://x.com/i/article/987654321
- **Filed:** [lessons-from-2-billion-agentic-workflows.md](./knowledge/articles/lessons-from-2-billion-agentic-workflows.md)
- **What:** Deep dive into patterns from scaling CrewAI to billions of agent executions.
```

### Actions

- **file**: Create a separate markdown file with rich metadata
- **capture**: Create a bookmark file only (no knowledge file)
- **transcribe**: Flag for future transcription *(auto-transcription coming soon! PRs welcome)*

### Custom Categories

Add your own categories in `xhoard.config.json`:

```json
{
  "categories": {
    "research": {
      "match": ["arxiv.org", "papers.", "scholar.google"],
      "action": "file",
      "folder": "./knowledge/research",
      "template": "article",
      "description": "Academic papers"
    },
    "newsletter": {
      "match": ["buttondown.email", "beehiiv.com"],
      "action": "file",
      "folder": "./knowledge/newsletters",
      "template": "article",
      "description": "Newsletter issues"
    }
  }
}
```

Your custom categories merge with the defaults. To override a default, use the same key (e.g., `github`, `article`).

## Bookmark Folders

If you've organized your Twitter bookmarks into folders, Xhoard can preserve that organization as tags. Configure folder IDs mapped to tag names:

```json
{
  "folders": {
    "1234567890": "ai-tools",
    "0987654321": "articles-to-read",
    "1122334455": "research"
  }
}
```

**How to find folder IDs:**
1. Open Twitter/X and go to your bookmarks
2. Click on a folder
3. The URL will be `https://x.com/i/bookmarks/1234567890` - the number is the folder ID

When folders are configured:
- Xhoard fetches from each folder separately
- Each bookmark gets tagged with its folder name
- Tags appear in bookmark files and knowledge file frontmatter

**Note:** Twitter's API doesn't return folder membership when fetching all bookmarks at once, so Xhoard must fetch each folder individually.

## Automation

Run Xhoard automatically every 30 minutes:

### Option A: PM2 (recommended)

```bash
npm install -g pm2
pm2 start "npx xhoard run" --cron "*/30 * * * *" --name xhoard
pm2 save
pm2 startup    # Start on boot
```

### Option B: Cron

```bash
crontab -e
# Add:
*/30 * * * * cd /path/to/xhoard && npx xhoard run >> xhoard.log 2>&1
```

### Option C: systemd

```bash
# Create /etc/systemd/system/xhoard.service
# See docs/systemd-setup.md for details
```

### Option D: GitHub Actions (Serverless)

Use bunx to run Xhoard in GitHub Actions without installing anything:

1. Copy `.github/workflows/archive-bookmarks.yml` from this repo to your own
2. Add your Twitter credentials as repository secrets:
   - `TWITTER_AUTH_TOKEN`
   - `TWITTER_CT0`
3. The workflow runs daily at 6 AM UTC (or trigger manually)

**Example workflow:**
```yaml
name: Archive Bookmarks
on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:      # Manual trigger

jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bunx xhoard fetch --all
        env:
          AUTH_TOKEN: ${{ secrets.TWITTER_AUTH_TOKEN }}
          CT0: ${{ secrets.TWITTER_CT0 }}
      - run: |
          git config user.email "action@github.com"
          git config user.name "GitHub Action"
          git add bookmarks/ knowledge/
          git diff --staged --quiet || (git commit -m "Archive bookmarks $(date +%Y-%m-%d)" && git push)
```

## Output

### bookmarks/YYYY-MM-DD/*.md

Your bookmarks saved as individual files, organized by date folders:

```markdown
---
tweet_id: "123456789"
author: "simonw"
date: "2026-01-02"
tweet_url: "https://x.com/simonw/status/123456789"
---

# Gist Host Fork for Rendering GitHub Gists

> I forked the wonderful gistpreview.github.io to create gisthost.github.io

- **Link:** https://gisthost.github.io/
- **Filed:** [gisthost-gist-rendering.md](./knowledge/articles/gisthost-gist-rendering.md)
- **What:** Free GitHub Pages-hosted tool that renders HTML files from Gists.
```

### knowledge/tools/*.md

GitHub repos get their own files:

```markdown
---
title: "whisper-flow"
type: tool
date_added: 2026-01-02
source: "https://github.com/dimastatz/whisper-flow"
tags: [ai, transcription, whisper, streaming]
via: "Twitter bookmark from @tom_doerr"
---

Real-time speech-to-text transcription using OpenAI Whisper...

## Key Features
- Streaming audio input
- Multiple language support
- Low latency output

## Links
- [GitHub](https://github.com/dimastatz/whisper-flow)
- [Original Tweet](https://x.com/tom_doerr/status/987654321)
```

## Configuration

Copy the example config and customize:

```bash
cp xhoard.config.example.json xhoard.config.json
```

Example `xhoard.config.json`:

```json
{
  "source": "bookmarks",
  "archiveMode": "files",
  "archiveDir": "./bookmarks",
  "archiveFile": "./bookmarks.md",
  "pendingFile": "./.state/pending-bookmarks.json",
  "stateFile": "./.state/bookmarks-state.json",
  "timezone": "America/New_York",
  "twitter": {
    "authToken": "your_auth_token",
    "ct0": "your_ct0"
  },
  "autoInvokeOpencode": true,
  "opencodeModel": "opencode/glm-4.7-free",
  "opencodeTimeout": 900000,
  "webhookUrl": null,
  "webhookType": "discord"
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `source` | `bookmarks` | What to fetch: `bookmarks` (default), `likes`, or `both` |
| `includeMedia` | `false` | **EXPERIMENTAL**: Include media attachments (photos, videos, GIFs) |
| `archiveMode` | `files` | Archive format: `files` (per bookmark) or `single` |
| `archiveDir` | `./bookmarks` | Where per-bookmark markdown files are written |
| `archiveFile` | `./bookmarks.md` | Legacy single-file archive (used when `archiveMode: single`) |
| `timezone` | `America/New_York` | For date formatting |
| `autoInvokeOpencode` | `true` | Auto-run OpenCode for analysis |
| `opencodeModel` | `opencode/glm-4.7-free` | OpenCode model (see OpenCode docs) |
| `opencodeTimeout` | `900000` | Max processing time (15 min) |
| `webhookUrl` | `null` | Discord/Slack webhook for notifications |

Environment variables also work: `AUTH_TOKEN`, `CT0`, `SOURCE`, `INCLUDE_MEDIA`, `ARCHIVE_MODE`, `ARCHIVE_DIR`, `ARCHIVE_FILE`, `TIMEZONE`, `AUTO_INVOKE_OPENCODE`, `OPENCODE_MODEL`, `OPENCODE_TIMEOUT`, etc.

### Experimental: Media Attachments

Media extraction (photos, videos, GIFs) is available but disabled by default. To enable:

```bash
# One-time with flag
npx xhoard fetch --media

# Or in config
{
  "includeMedia": true
}
```

When enabled, the `media[]` array is included in the pending JSON with:
- `type`: "photo", "video", or "animated_gif"
- `url`: Full-size media URL
- `previewUrl`: Thumbnail (smaller, faster)
- `width`, `height`: Dimensions
- `videoUrl`, `durationMs`: For videos only

⚠️ **Why experimental?**
1. **Requires bird with media support** - PR [#14](https://github.com/steipete/bird/pull/14) adds media extraction. Until merged, you'll need a fork with this PR or wait for an upstream release. Without it, `--media` is a no-op (empty array).
2. **Workflow still being refined** - Short screengrabs (< 30s) don't need transcripts, but longer videos might. We're still figuring out the best handling.

## OpenCode SDK Integration

Xhoard now invokes OpenCode programmatically through `@opencode-ai/sdk`.

- It starts an isolated OpenCode server/client session per run.
- It executes the project command at `.opencode/commands/process-bookmarks.md`.
- It uses your configured model (`opencodeModel`) and respects `opencodeTimeout`.

You can also run processing manually inside OpenCode:

```text
/process-bookmarks
```

### Token Usage Tracking

Track your API costs with the `-t` flag:

```bash
npx xhoard run -t
# or
npx xhoard run --track-tokens
```

This displays a breakdown at the end of each run:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 TOKEN USAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Main (opencode/glm-4.7-free):
  Input:               85 tokens
  Output:           5,327 tokens
  Cache Read:     724,991 tokens
  Cache Write:     62,233 tokens
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Troubleshooting

### "No new bookmarks to process"

This means either:
1. No bookmarks were fetched (check bird CLI credentials)
2. All fetched bookmarks already exist in your archive (`bookmarks/` by default)

To start fresh:
```bash
rm -rf .state/ bookmarks/ bookmarks.md knowledge/
mkdir -p .state knowledge/tools knowledge/articles
npx xhoard run
```

### Bird CLI 403 errors

Your Twitter cookies may have expired. Get fresh ones from your browser.

### Processing is slow

- Try a faster OpenCode model in `opencodeModel` for quicker processing
- Make sure you're not re-processing with `--force` (causes edits instead of appends)

### Only ~50-70 bookmarks fetched

The npm release of bird CLI (v0.5.1) doesn't support pagination. To fetch all bookmarks, install bird from git:

```bash
# Clone and build bird from source
cd /tmp
git clone https://github.com/steipete/bird.git
cd bird
pnpm install    # or: npm install -g pnpm && pnpm install
pnpm run build:dist

# Link globally (may need sudo or --force)
npm link --force

# Verify
bird --version  # Should show a newer commit hash
bird bookmarks --help  # Should show --all flag
```

Then use `npx xhoard fetch --all` to fetch all bookmarks with pagination.

## Credits

- [bird CLI](https://github.com/steipete/bird) by Peter Steinberger
- This project is a fork of [smaug](https://github.com/alexknowshtml/smaug)
- Built with OpenCode SDK

## License

MIT
