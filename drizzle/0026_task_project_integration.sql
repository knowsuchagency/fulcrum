-- Project Repositories join table (M:N relationship)
CREATE TABLE `project_repositories` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `repository_id` text NOT NULL,
  `is_primary` integer DEFAULT false,
  `created_at` text NOT NULL
);--> statement-breakpoint

-- Task Dependencies table
CREATE TABLE `task_dependencies` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL,
  `depends_on_task_id` text NOT NULL,
  `created_at` text NOT NULL
);--> statement-breakpoint

-- Task table additions for generalized task management
ALTER TABLE `tasks` ADD `project_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repository_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `labels` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `due_date` text;
