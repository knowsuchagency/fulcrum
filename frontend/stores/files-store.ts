import { types, flow } from 'mobx-state-tree'
import type { Instance } from 'mobx-state-tree'
import { fetchJSON } from '@/lib/api'
import type { FileContent, FileTreeEntry } from '@/types'

const API_BASE = ''

/**
 * Represents an open file with its content and edit state
 */
export const FileModel = types
  .model('File', {
    path: types.identifier,
    content: types.string,
    originalContent: types.string,
    mimeType: types.string,
    size: types.number,
    lineCount: types.number,
    truncated: types.boolean,
    isMarkdownView: types.optional(types.boolean, false),
  })
  .views((self) => ({
    get isDirty(): boolean {
      return self.content !== self.originalContent
    },
    get isMarkdown(): boolean {
      return self.path.toLowerCase().endsWith('.md')
    },
    get isImage(): boolean {
      return self.mimeType.startsWith('image/')
    },
    get isBinary(): boolean {
      return self.mimeType === 'application/octet-stream'
    },
    get isEditable(): boolean {
      return !self.mimeType.startsWith('image/') && self.mimeType !== 'application/octet-stream'
    },
  }))
  .actions((self) => ({
    setContent(content: string) {
      self.content = content
    },
    markSaved() {
      self.originalContent = self.content
    },
    toggleMarkdownView() {
      self.isMarkdownView = !self.isMarkdownView
    },
    setMarkdownView(value: boolean) {
      self.isMarkdownView = value
    },
  }))

export type IFile = Instance<typeof FileModel>

/**
 * File tree response from API
 */
interface FileTreeResponse {
  root: string
  entries: FileTreeEntry[]
}

/**
 * Write file response from API
 */
interface WriteFileResponse {
  success: boolean
  size: number
}

/**
 * Files store for managing file viewing and editing
 */
export const FilesStore = types
  .model('FilesStore', {
    selectedFile: types.maybeNull(types.string),
    expandedDirs: types.array(types.string),
    openFiles: types.map(FileModel),
  })
  .volatile(() => ({
    worktreePath: null as string | null,
    isLoading: false,
    isSaving: false,
    loadError: null as string | null,
    saveError: null as string | null,
    fileTree: null as FileTreeEntry[] | null,
    isLoadingTree: false,
    treeError: null as string | null,
  }))
  .views((self) => ({
    get currentFile(): IFile | undefined {
      if (!self.selectedFile) return undefined
      return self.openFiles.get(self.selectedFile)
    },
    get isDirty(): boolean {
      const file = self.selectedFile ? self.openFiles.get(self.selectedFile) : undefined
      return file?.isDirty ?? false
    },
    isFileMarkdownView(path: string): boolean {
      const file = self.openFiles.get(path)
      return file?.isMarkdownView ?? false
    },
    isDirExpanded(path: string): boolean {
      return self.expandedDirs.includes(path)
    },
  }))
  .actions((self) => ({
    setWorktreePath(path: string | null) {
      if (self.worktreePath !== path) {
        self.worktreePath = path
        self.selectedFile = null
        self.expandedDirs.clear()
        self.openFiles.clear()
        self.fileTree = null
      }
    },

    selectFile(path: string | null) {
      self.selectedFile = path
    },

    toggleDir(path: string) {
      const index = self.expandedDirs.indexOf(path)
      if (index >= 0) {
        self.expandedDirs.splice(index, 1)
      } else {
        self.expandedDirs.push(path)
      }
    },

    collapseAll() {
      self.expandedDirs.clear()
    },

    updateContent(path: string, content: string) {
      const file = self.openFiles.get(path)
      if (file) {
        file.setContent(content)
      }
    },

    toggleMarkdownView(path: string) {
      const file = self.openFiles.get(path)
      if (file) {
        file.toggleMarkdownView()
      }
    },

    // Internal actions for async flows
    _setLoading(loading: boolean) {
      self.isLoading = loading
    },
    _setLoadError(error: string | null) {
      self.loadError = error
    },
    _setSaving(saving: boolean) {
      self.isSaving = saving
    },
    _setSaveError(error: string | null) {
      self.saveError = error
    },
    _setFileTree(entries: FileTreeEntry[] | null) {
      self.fileTree = entries
    },
    _setLoadingTree(loading: boolean) {
      self.isLoadingTree = loading
    },
    _setTreeError(error: string | null) {
      self.treeError = error
    },
    _addFile(data: {
      path: string
      content: string
      mimeType: string
      size: number
      lineCount: number
      truncated: boolean
    }) {
      self.openFiles.set(data.path, {
        path: data.path,
        content: data.content,
        originalContent: data.content,
        mimeType: data.mimeType,
        size: data.size,
        lineCount: data.lineCount,
        truncated: data.truncated,
        isMarkdownView: false,
      })
    },
    _markFileSaved(path: string) {
      const file = self.openFiles.get(path)
      if (file) {
        file.markSaved()
      }
    },
  }))
  .actions((self) => ({
    loadFileTree: flow(function* () {
      if (!self.worktreePath) return

      self._setLoadingTree(true)
      self._setTreeError(null)

      try {
        const response: FileTreeResponse = yield fetchJSON(
          `${API_BASE}/api/fs/tree?root=${encodeURIComponent(self.worktreePath)}`
        )
        self._setFileTree(response.entries)
      } catch (error) {
        self._setTreeError(error instanceof Error ? error.message : 'Failed to load file tree')
      } finally {
        self._setLoadingTree(false)
      }
    }),

    loadFile: flow(function* (path: string) {
      if (!self.worktreePath) return

      // Check if file is already loaded
      if (self.openFiles.has(path)) {
        self.selectedFile = path
        return
      }

      self._setLoading(true)
      self._setLoadError(null)

      try {
        const params = new URLSearchParams({
          path,
          root: self.worktreePath,
        })
        const response: FileContent = yield fetchJSON(`${API_BASE}/api/fs/read?${params}`)

        self._addFile({
          path,
          content: response.content,
          mimeType: response.mimeType,
          size: response.size,
          lineCount: response.lineCount,
          truncated: response.truncated,
        })
        self.selectedFile = path
      } catch (error) {
        self._setLoadError(error instanceof Error ? error.message : 'Failed to load file')
      } finally {
        self._setLoading(false)
      }
    }),

    saveFile: flow(function* (path: string) {
      if (!self.worktreePath) return

      const file = self.openFiles.get(path)
      if (!file || !file.isDirty) return

      self._setSaving(true)
      self._setSaveError(null)

      try {
        const response: WriteFileResponse = yield fetch(`${API_BASE}/api/fs/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path,
            root: self.worktreePath,
            content: file.content,
          }),
        }).then((res) => {
          if (!res.ok) {
            return res.json().then((data) => {
              throw new Error(data.error || 'Failed to save file')
            })
          }
          return res.json()
        })

        if (response.success) {
          self._markFileSaved(path)
        }
      } catch (error) {
        self._setSaveError(error instanceof Error ? error.message : 'Failed to save file')
        throw error
      } finally {
        self._setSaving(false)
      }
    }),

    closeFile(path: string) {
      self.openFiles.delete(path)
      if (self.selectedFile === path) {
        self.selectedFile = null
      }
    },
  }))

export type IFilesStore = Instance<typeof FilesStore>

/**
 * Create a standalone files store instance
 */
export function createFilesStore(): IFilesStore {
  return FilesStore.create({
    selectedFile: null,
    expandedDirs: [],
    openFiles: {},
  })
}
