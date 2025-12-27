# vibora-utils

Cloudflare Worker that provides stable download URLs for the latest Vibora releases.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `/download/dmg` | Redirects to latest macOS DMG |
| `/download/appimage` | Redirects to latest Linux AppImage |
| `/download/info` | Returns JSON with version and asset URLs |

## Usage

```markdown
[Download for macOS](https://vibora-utils.knowsuchagency.workers.dev/download/dmg)
[Download for Linux](https://vibora-utils.knowsuchagency.workers.dev/download/appimage)
```

## Development

```bash
bun install
bun run dev        # Local development
bun run deploy     # Deploy to Cloudflare
```

Or from the project root:

```bash
mise run worker:deploy
```

## How It Works

The worker fetches the latest release from GitHub's API, finds the DMG/AppImage assets, and redirects to their download URLs. Responses are cached for 5 minutes.
