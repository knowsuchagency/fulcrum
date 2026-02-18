import type { Task } from '../../shared/types'

/**
 * Groups tasks by repository, matching on repoPath or repositoryId.
 * Tasks with neither field are not assigned to any repo.
 */
export function computeTasksByRepo(
  allTasks: Task[],
  repositories: { id: string; path: string }[]
): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const repo of repositories) {
    const repoTasks = allTasks.filter(
      (task) => task.repoPath === repo.path || task.repositoryId === repo.id
    )
    map.set(repo.id, repoTasks)
  }
  return map
}
