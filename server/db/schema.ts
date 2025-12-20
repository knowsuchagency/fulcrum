import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('IN_PROGRESS'),
  position: integer('position').notNull(),
  repoPath: text('repo_path').notNull(),
  repoName: text('repo_name').notNull(),
  baseBranch: text('base_branch').notNull(),
  branch: text('branch'),
  worktreePath: text('worktree_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Type inference helpers
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
