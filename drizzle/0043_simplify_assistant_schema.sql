-- Simplify chat_sessions: remove sandbox-related columns (worktree_path, branch, dev_port)
-- Simplify artifacts: replace contentPath/previewPath with content field

-- Create new chat_sessions table without sandbox columns
CREATE TABLE `chat_sessions_new` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `provider` text DEFAULT 'claude' NOT NULL,
  `model` text,
  `project_id` text,
  `context` text,
  `is_favorite` integer DEFAULT false,
  `message_count` integer DEFAULT 0,
  `last_message_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint

-- Copy data from old table
INSERT INTO `chat_sessions_new` (`id`, `title`, `provider`, `model`, `project_id`, `context`, `is_favorite`, `message_count`, `last_message_at`, `created_at`, `updated_at`)
SELECT `id`, `title`, `provider`, `model`, `project_id`, `context`, `is_favorite`, `message_count`, `last_message_at`, `created_at`, `updated_at`
FROM `chat_sessions`;--> statement-breakpoint

-- Drop old table and rename new one
DROP TABLE `chat_sessions`;--> statement-breakpoint
ALTER TABLE `chat_sessions_new` RENAME TO `chat_sessions`;--> statement-breakpoint

-- Create new artifacts table with content field instead of contentPath/previewPath
CREATE TABLE `artifacts_new` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text,
  `message_id` text,
  `type` text NOT NULL,
  `title` text NOT NULL,
  `description` text,
  `content` text,
  `version` integer DEFAULT 1,
  `preview_url` text,
  `is_favorite` integer DEFAULT false,
  `tags` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);--> statement-breakpoint

-- Copy data from old table (content will be null for existing artifacts)
INSERT INTO `artifacts_new` (`id`, `session_id`, `message_id`, `type`, `title`, `description`, `content`, `version`, `preview_url`, `is_favorite`, `tags`, `created_at`, `updated_at`)
SELECT `id`, `session_id`, `message_id`, `type`, `title`, `description`, NULL, `version`, NULL, `is_favorite`, `tags`, `created_at`, `updated_at`
FROM `artifacts`;--> statement-breakpoint

-- Drop old table and rename new one
DROP TABLE `artifacts`;--> statement-breakpoint
ALTER TABLE `artifacts_new` RENAME TO `artifacts`;
