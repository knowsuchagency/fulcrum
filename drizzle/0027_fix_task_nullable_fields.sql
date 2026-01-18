-- Fix NOT NULL constraints on repo_path, repo_name, base_branch
-- SQLite doesn't support ALTER TABLE to remove NOT NULL, so we recreate the table
-- This migration is needed for databases that ran 0026 before the table recreation was added
-- Note: linear_ticket_id and linear_ticket_url are intentionally omitted as they were removed

-- Create new tasks table with nullable repo fields
CREATE TABLE `tasks_new` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `status` text NOT NULL DEFAULT 'IN_PROGRESS',
  `position` integer NOT NULL,
  `repo_path` text,
  `repo_name` text,
  `base_branch` text,
  `branch` text,
  `worktree_path` text,
  `view_state` text,
  `pr_url` text,
  `startup_script` text,
  `agent` text NOT NULL DEFAULT 'claude',
  `ai_mode` text,
  `agent_options` text,
  `opencode_model` text,
  `pinned` integer DEFAULT false,
  `project_id` text,
  `repository_id` text,
  `labels` text,
  `started_at` text,
  `due_date` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint

-- Copy existing data to new table
INSERT INTO `tasks_new` (
  `id`, `title`, `description`, `status`, `position`,
  `repo_path`, `repo_name`, `base_branch`, `branch`, `worktree_path`,
  `view_state`, `pr_url`,
  `startup_script`, `agent`, `ai_mode`, `agent_options`, `opencode_model`,
  `pinned`, `project_id`, `repository_id`, `labels`, `started_at`, `due_date`,
  `created_at`, `updated_at`
)
SELECT
  `id`, `title`, `description`, `status`, `position`,
  `repo_path`, `repo_name`, `base_branch`, `branch`, `worktree_path`,
  `view_state`, `pr_url`,
  `startup_script`, `agent`, `ai_mode`, `agent_options`, `opencode_model`,
  `pinned`, `project_id`, `repository_id`, `labels`, `started_at`, `due_date`,
  `created_at`, `updated_at`
FROM `tasks`;--> statement-breakpoint

-- Drop old table and rename new one
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `tasks_new` RENAME TO `tasks`;
