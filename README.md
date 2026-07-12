# Xhoard

Archive your Twitter/X bookmarks (and likes, optionally) to markdown. Automatically.

Xhoard fetches bookmarks via Twitter's GraphQL API directly (no external CLI required), extracts content from linked pages, and uses a selectable AI provider to categorize and file them. New configurations use Codex with `codex-spark`; [OpenCode](https://github.com/opencode-ai/opencode) remains available.

## Quick Start

```bash
git clone https://github.com/TudorAndrei/xhoard
cd xhoard
bun install
bun src/cli.js setup
```

The setup wizard collects your Twitter cookies, tests them, writes `xhoard.config.json`, and fetches a first batch.

Before processing with the default Codex provider, sign in once with the ChatGPT subscription you want Xhoard to use:

```bash
bunx @openai/codex login
```

Xhoard's Codex SDK integration reuses that local CLI login; it does not require or save an API key.

Or run without installing (GitHub Actions, etc.):

```bash
AUTH_TOKEN=xxx CT0=xxx bunx xhoard fetch
```

## Twitter Credentials

Xhoard needs two session cookies:

1. Open Twitter/X, then DevTools → Application → Cookies
2. Copy `auth_token` and `ct0`
3. Either paste into the setup wizard or edit `xhoard.config.json`:

```json
{
  "twitter": {
    "authToken": "your_auth_token",
    "ct0": "your_ct0"
  }
}
```

`xhoard.config.json` is gitignored.

## What It Does

1. Fetches bookmarks (or likes, or both) from Twitter/X
2. Expands `t.co` links, pulls content from linked pages (articles, GitHub READMEs, X long-form articles, quoted/reply context)
3. Invokes the selected AI provider to categorize each item
4. Writes one markdown file per bookmark under `bookmarks/YYYY-MM-DD/`, plus knowledge files under `knowledge/tools/` and `knowledge/articles/`

## Commands

```bash
bun src/cli.js fetch              # Fetch 20 latest
bun src/cli.js fetch 50           # Fetch 50
bun src/cli.js fetch --all        # Paginate all bookmarks
bun src/cli.js fetch --source likes
bun src/cli.js fetch --source both
bun src/cli.js run                # Fetch + process with the selected AI provider
bun src/cli.js run --limit 50 -t  # Batch + token tracking
bun src/cli.js status
```

## Automation

PM2 (recommended):

```bash
pm2 start "bun src/cli.js run --quiet" --cron "*/30 * * * *" --name xhoard
pm2 save
```

Cron:

```
*/30 * * * * cd /path/to/xhoard && bun src/cli.js run >> xhoard.log 2>&1
```

GitHub Actions: copy `.github/workflows/archive-bookmarks.yml` and add `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` secrets.

## Configuration

See `xhoard.config.example.json` for the full shape. Common options:

| Option | Default | Description |
| --- | --- | --- |
| `source` | `bookmarks` | `bookmarks`, `likes`, or `both` |
| `archiveDir` | `./bookmarks` | Where per-bookmark files are written |
| `folders` | `{}` | Map bookmark-folder IDs to tag names |
| `categories` | (defaults) | Routing rules for linked content |
| `includeMedia` | `false` | Experimental: include photos/videos/GIFs |
| `ai.provider` | `codex` | `codex` or `opencode` |
| `ai.autoInvoke` | `true` | Run the selected provider after fetching |
| `ai.codex.model` | `codex-spark` | Codex model to use with the local ChatGPT subscription login |
| `ai.opencode.model` | `opencode/glm-4.7-free` | Model to use when `ai.provider` is `opencode` |
| `webhookUrl` | `null` | Discord/Slack notifications |

Configure both providers in one file and switch between them with `ai.provider`:

```json
{
  "ai": {
    "provider": "codex",
    "autoInvoke": true,
    "codex": {
      "model": "codex-spark",
      "timeout": 900000
    },
    "opencode": {
      "model": "opencode/glm-4.7-free",
      "timeout": 900000
    }
  }
}
```

Environment overrides: `AI_PROVIDER`, `AUTO_INVOKE_AI`, `CODEX_MODEL`, `CODEX_TIMEOUT`, `OPENCODE_MODEL`, and `OPENCODE_TIMEOUT`. Existing `autoInvokeOpencode`, `opencodeModel`, `opencodeTimeout`, and their `OPENCODE_*` environment variables continue to select OpenCode for compatibility.

### Bookmark folders

If you organize bookmarks into folders on Twitter, map the folder ID (from `x.com/i/bookmarks/<id>`) to a tag name:

```json
{
  "folders": {
    "1234567890": "ai-tools",
    "0987654321": "articles-to-read"
  }
}
```

Each bookmark gets tagged with its folder name in the output.

## Troubleshooting

- **401/403 when fetching**: your Twitter cookies expired. Grab fresh `auth_token` / `ct0` from DevTools.
- **"No new bookmarks"**: everything fetched already exists in `bookmarks/`. To reset: `rm -rf .state/ bookmarks/ knowledge/`.
- **Codex authentication failed**: run `bunx @openai/codex login` in the same user environment as the scheduled job, then retry. This uses your ChatGPT subscription login.
- **Processing is slow**: choose another `ai.codex.model` or `ai.opencode.model`, or batch with `run --limit N`.

## Credits

- Twitter GraphQL client vendored and trimmed from [@leavingme/bird](https://www.npmjs.com/package/@leavingme/bird) (a fork of [@steipete/bird](https://github.com/steipete/bird)). See `LICENSE` for attribution.
- Forked from [smaug](https://github.com/alexknowshtml/smaug).

## License

MIT
