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

export const terminals = sqliteTable('terminals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cwd: text('cwd').notNull(),
  cols: integer('cols').notNull().default(80),
  rows: integer('rows').notNull().default(24),
  tmuxSession: text('tmux_session').notNull(),
  status: text('status').notNull().default('running'),
  exitCode: integer('exit_code'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// Type inference helpers
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type Terminal = typeof terminals.$inferSelect
export type NewTerminal = typeof terminals.$inferInsert
