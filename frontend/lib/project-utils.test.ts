import { describe, test, expect } from 'bun:test'
import { computeTasksByRepo } from './project-utils'
import type { Task } from '../../shared/types'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test task',
    description: null,
    status: 'TO_DO',
    position: 0,
    repoPath: null,
    repoName: null,
    baseBranch: null,
    branch: null,
    prefix: null,
    worktreePath: null,
    viewState: null,
    prUrl: null,
    startupScript: null,
    agent: 'claude',
    aiMode: null,
    agentOptions: null,
    opencodeModel: null,
    type: null,
    pinned: false,
    projectId: null,
    repositoryId: null,
    tags: [],
    startedAt: null,
    dueDate: null,
    timeEstimate: null,
    priority: null,
    recurrenceRule: null,
    recurrenceEndDate: null,
    recurrenceSourceTaskId: null,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const repoA = { id: 'repo-a', path: '/repos/alpha' }
const repoB = { id: 'repo-b', path: '/repos/beta' }

describe('computeTasksByRepo', () => {
  test('matches task by repoPath to the correct repo only', () => {
    const task = makeTask({ id: 't1', repoPath: '/repos/alpha' })
    const result = computeTasksByRepo([task], [repoA, repoB])

    expect(result.get('repo-a')).toEqual([task])
    expect(result.get('repo-b')).toEqual([])
  })

  test('matches task by repositoryId to the correct repo only', () => {
    const task = makeTask({ id: 't2', repositoryId: 'repo-b' })
    const result = computeTasksByRepo([task], [repoA, repoB])

    expect(result.get('repo-a')).toEqual([])
    expect(result.get('repo-b')).toEqual([task])
  })

  test('task with both repoPath and repositoryId pointing to same repo is not duplicated', () => {
    const task = makeTask({ id: 't3', repoPath: '/repos/alpha', repositoryId: 'repo-a' })
    const result = computeTasksByRepo([task], [repoA, repoB])

    expect(result.get('repo-a')).toEqual([task])
    expect(result.get('repo-b')).toEqual([])
  })

  test('project-level task with no repoPath or repositoryId is not assigned to any repo', () => {
    const task = makeTask({ id: 't4', projectId: 'proj-1' })
    const result = computeTasksByRepo([task], [repoA, repoB])

    expect(result.get('repo-a')).toEqual([])
    expect(result.get('repo-b')).toEqual([])
  })

  test('multiple repos get independent task lists (core bug scenario)', () => {
    const taskA = makeTask({ id: 't-a', repoPath: '/repos/alpha' })
    const taskB = makeTask({ id: 't-b', repositoryId: 'repo-b' })
    const orphan = makeTask({ id: 't-orphan', projectId: 'proj-1' })

    const result = computeTasksByRepo([taskA, taskB, orphan], [repoA, repoB])

    expect(result.get('repo-a')).toEqual([taskA])
    expect(result.get('repo-b')).toEqual([taskB])
  })

  test('empty tasks and repos returns empty map', () => {
    expect(computeTasksByRepo([], []).size).toBe(0)
  })

  test('repos with no matching tasks get empty arrays', () => {
    const result = computeTasksByRepo([], [repoA, repoB])
    expect(result.get('repo-a')).toEqual([])
    expect(result.get('repo-b')).toEqual([])
  })
})
