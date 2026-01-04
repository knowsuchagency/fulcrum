import { describe, test, expect } from 'bun:test'
import { isGitUrl, extractRepoNameFromUrl } from './git-utils'

describe('git-utils', () => {
  describe('isGitUrl', () => {
    test('recognizes SSH URLs', () => {
      expect(isGitUrl('git@github.com:user/repo.git')).toBe(true)
      expect(isGitUrl('git@gitlab.com:user/repo.git')).toBe(true)
      expect(isGitUrl('git@bitbucket.org:user/repo.git')).toBe(true)
    })

    test('recognizes HTTPS URLs', () => {
      expect(isGitUrl('https://github.com/user/repo.git')).toBe(true)
      expect(isGitUrl('https://gitlab.com/user/repo.git')).toBe(true)
      expect(isGitUrl('https://bitbucket.org/user/repo.git')).toBe(true)
      expect(isGitUrl('https://github.com/user/repo')).toBe(true)
    })

    test('recognizes HTTP URLs', () => {
      expect(isGitUrl('http://github.com/user/repo.git')).toBe(true)
      expect(isGitUrl('http://internal-server/repo.git')).toBe(true)
    })

    test('recognizes shorthand formats', () => {
      expect(isGitUrl('gh:user/repo')).toBe(true) // GitHub shorthand
      expect(isGitUrl('gl:user/repo')).toBe(true) // GitLab shorthand
      expect(isGitUrl('bb:user/repo')).toBe(true) // Bitbucket shorthand
    })

    test('rejects non-git URLs', () => {
      expect(isGitUrl('/path/to/local/repo')).toBe(false)
      expect(isGitUrl('./relative/path')).toBe(false)
      expect(isGitUrl('repo-name')).toBe(false)
      expect(isGitUrl('')).toBe(false)
      expect(isGitUrl('ftp://server/repo.git')).toBe(false)
    })

    test('rejects local paths that look similar', () => {
      expect(isGitUrl('/git@folder/path')).toBe(false)
      expect(isGitUrl('notgit@github.com:user/repo')).toBe(false)
    })
  })

  describe('extractRepoNameFromUrl', () => {
    describe('HTTPS URLs', () => {
      test('extracts name from GitHub URL with .git', () => {
        expect(extractRepoNameFromUrl('https://github.com/user/my-repo.git')).toBe('my-repo')
      })

      test('extracts name from GitHub URL without .git', () => {
        expect(extractRepoNameFromUrl('https://github.com/user/my-repo')).toBe('my-repo')
      })

      test('extracts name from GitLab URL', () => {
        expect(extractRepoNameFromUrl('https://gitlab.com/user/project-name.git')).toBe('project-name')
      })

      test('extracts name from Bitbucket URL', () => {
        expect(extractRepoNameFromUrl('https://bitbucket.org/user/awesome-project.git')).toBe('awesome-project')
      })

      test('extracts name from nested path URL', () => {
        expect(extractRepoNameFromUrl('https://gitlab.com/group/subgroup/repo.git')).toBe('repo')
      })

      test('extracts name from self-hosted URL', () => {
        expect(extractRepoNameFromUrl('https://git.company.com/internal/project.git')).toBe('project')
      })
    })

    describe('SSH URLs', () => {
      test('extracts name from GitHub SSH URL', () => {
        expect(extractRepoNameFromUrl('git@github.com:user/my-repo.git')).toBe('my-repo')
      })

      test('extracts name from GitHub SSH URL without .git', () => {
        expect(extractRepoNameFromUrl('git@github.com:user/my-repo')).toBe('my-repo')
      })

      test('extracts name from GitLab SSH URL', () => {
        expect(extractRepoNameFromUrl('git@gitlab.com:group/repo.git')).toBe('repo')
      })

      test('extracts name from Bitbucket SSH URL', () => {
        expect(extractRepoNameFromUrl('git@bitbucket.org:workspace/project.git')).toBe('project')
      })
    })

    describe('Shorthand URLs', () => {
      test('extracts name from gh: shorthand', () => {
        expect(extractRepoNameFromUrl('gh:user/repo-name')).toBe('repo-name')
      })

      test('extracts name from gl: shorthand', () => {
        expect(extractRepoNameFromUrl('gl:group/project')).toBe('project')
      })

      test('extracts name from bb: shorthand', () => {
        expect(extractRepoNameFromUrl('bb:workspace/repo')).toBe('repo')
      })

      test('handles shorthand without user (returns full string)', () => {
        // When there's no slash, split('/') returns the full string as last element
        expect(extractRepoNameFromUrl('gh:repo-only')).toBe('gh:repo-only')
      })
    })

    describe('Edge cases', () => {
      test('handles repo names with special characters', () => {
        expect(extractRepoNameFromUrl('https://github.com/user/my_repo-v2.git')).toBe('my_repo-v2')
      })

      test('handles repo names with dots', () => {
        expect(extractRepoNameFromUrl('https://github.com/user/repo.name.git')).toBe('repo.name')
      })

      test('handles URLs with trailing slashes', () => {
        expect(extractRepoNameFromUrl('https://github.com/user/repo/')).toBe('')
      })

      test('handles HTTP URLs', () => {
        expect(extractRepoNameFromUrl('http://github.com/user/repo.git')).toBe('repo')
      })
    })
  })
})
