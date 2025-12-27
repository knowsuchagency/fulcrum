import { Hono } from 'hono'
import { cache } from 'hono/cache'

const app = new Hono()

const GITHUB_REPO = 'knowsuchagency/vibora'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  assets: GitHubAsset[]
}

async function getLatestRelease(): Promise<GitHubRelease> {
  const response = await fetch(GITHUB_API_URL, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'vibora-utils-worker',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  return response.json()
}

function findAsset(assets: GitHubAsset[], pattern: RegExp): GitHubAsset | undefined {
  return assets.find(asset => pattern.test(asset.name))
}

// Cache responses for 5 minutes
app.use('/download/*', cache({
  cacheName: 'vibora-releases',
  cacheControl: 'public, max-age=300',
}))

app.get('/download/dmg', async (c) => {
  try {
    const release = await getLatestRelease()
    const asset = findAsset(release.assets, /\.dmg$/)

    if (!asset) {
      return c.json({ error: 'DMG not found in latest release' }, 404)
    }

    return c.redirect(asset.browser_download_url, 302)
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

app.get('/download/appimage', async (c) => {
  try {
    const release = await getLatestRelease()
    const asset = findAsset(release.assets, /\.AppImage$/)

    if (!asset) {
      return c.json({ error: 'AppImage not found in latest release' }, 404)
    }

    return c.redirect(asset.browser_download_url, 302)
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

// Info endpoint that returns release metadata without redirecting
app.get('/download/info', async (c) => {
  try {
    const release = await getLatestRelease()
    const dmg = findAsset(release.assets, /\.dmg$/)
    const appimage = findAsset(release.assets, /\.AppImage$/)

    return c.json({
      version: release.tag_name,
      assets: {
        dmg: dmg?.browser_download_url ?? null,
        appimage: appimage?.browser_download_url ?? null,
      },
    })
  } catch (error) {
    return c.json({ error: String(error) }, 500)
  }
})

app.get('/', (c) => {
  return c.json({
    name: 'vibora-utils',
    endpoints: {
      '/download/dmg': 'Redirects to latest macOS DMG',
      '/download/appimage': 'Redirects to latest Linux AppImage',
      '/download/info': 'Returns release info as JSON',
    },
  })
})

export default app
