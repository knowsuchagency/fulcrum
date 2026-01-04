import { describe, test, expect } from 'bun:test'
import { buildEditorUrl, buildVSCodeUrl, getEditorDisplayName, type EditorApp } from './editor-url'

describe('buildEditorUrl', () => {
  const testPath = '/home/user/project'

  describe('local URLs', () => {
    test('builds VS Code local URL', () => {
      expect(buildEditorUrl(testPath, 'vscode', '', 22)).toBe('vscode://file/home/user/project')
    })

    test('builds Cursor local URL', () => {
      expect(buildEditorUrl(testPath, 'cursor', '', 22)).toBe('cursor://file/home/user/project')
    })

    test('builds Windsurf local URL', () => {
      expect(buildEditorUrl(testPath, 'windsurf', '', 22)).toBe('windsurf://file/home/user/project')
    })

    test('builds Zed local URL', () => {
      expect(buildEditorUrl(testPath, 'zed', '', 22)).toBe('zed://file/home/user/project')
    })

    test('builds Antigravity local URL', () => {
      expect(buildEditorUrl(testPath, 'antigravity', '', 22)).toBe('antigravity://file/home/user/project')
    })
  })

  describe('remote URLs with default port', () => {
    test('builds VS Code remote URL', () => {
      expect(buildEditorUrl(testPath, 'vscode', 'server.local', 22)).toBe(
        'vscode://vscode-remote/ssh-remote+server.local/home/user/project'
      )
    })

    test('builds Cursor remote URL', () => {
      expect(buildEditorUrl(testPath, 'cursor', 'server.local', 22)).toBe(
        'cursor://vscode-remote/ssh-remote+server.local/home/user/project'
      )
    })

    test('builds Windsurf remote URL', () => {
      expect(buildEditorUrl(testPath, 'windsurf', 'server.local', 22)).toBe(
        'windsurf://vscode-remote/ssh-remote+server.local/home/user/project'
      )
    })
  })

  describe('remote URLs with custom port', () => {
    test('includes port in SSH remote', () => {
      expect(buildEditorUrl(testPath, 'vscode', 'server.local', 2222)).toBe(
        'vscode://vscode-remote/ssh-remote+server.local:2222/home/user/project'
      )
    })

    test('includes port for all editors', () => {
      expect(buildEditorUrl(testPath, 'cursor', 'host', 8022)).toBe(
        'cursor://vscode-remote/ssh-remote+host:8022/home/user/project'
      )
    })
  })

  describe('edge cases', () => {
    test('handles root path', () => {
      expect(buildEditorUrl('/', 'vscode', '', 22)).toBe('vscode://file/')
    })

    test('handles path with spaces', () => {
      expect(buildEditorUrl('/home/user/my project', 'vscode', '', 22)).toBe(
        'vscode://file/home/user/my project'
      )
    })

    test('handles IP address as host', () => {
      expect(buildEditorUrl(testPath, 'vscode', '192.168.1.100', 22)).toBe(
        'vscode://vscode-remote/ssh-remote+192.168.1.100/home/user/project'
      )
    })

    test('handles hostname with domain', () => {
      expect(buildEditorUrl(testPath, 'vscode', 'dev.example.com', 22)).toBe(
        'vscode://vscode-remote/ssh-remote+dev.example.com/home/user/project'
      )
    })
  })
})

describe('buildVSCodeUrl (legacy)', () => {
  test('delegates to buildEditorUrl with vscode', () => {
    const path = '/test/path'
    const host = 'server'
    const port = 22

    expect(buildVSCodeUrl(path, host, port)).toBe(buildEditorUrl(path, 'vscode', host, port))
  })
})

describe('getEditorDisplayName', () => {
  test('returns VS Code for vscode', () => {
    expect(getEditorDisplayName('vscode')).toBe('VS Code')
  })

  test('returns Cursor for cursor', () => {
    expect(getEditorDisplayName('cursor')).toBe('Cursor')
  })

  test('returns Windsurf for windsurf', () => {
    expect(getEditorDisplayName('windsurf')).toBe('Windsurf')
  })

  test('returns Zed for zed', () => {
    expect(getEditorDisplayName('zed')).toBe('Zed')
  })

  test('returns Antigravity for antigravity', () => {
    expect(getEditorDisplayName('antigravity')).toBe('Antigravity')
  })

  test('returns display name for all editor types', () => {
    const editors: EditorApp[] = ['vscode', 'cursor', 'windsurf', 'zed', 'antigravity']
    for (const editor of editors) {
      expect(getEditorDisplayName(editor)).toBeTruthy()
      expect(typeof getEditorDisplayName(editor)).toBe('string')
    }
  })
})
