CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'IN_PROGRESS' NOT NULL,
	`position` integer NOT NULL,
	`repo_path` text NOT NULL,
	`repo_name` text NOT NULL,
	`base_branch` text NOT NULL,
	`branch` text,
	`worktree_path` text,
	`view_state` text,
	`pr_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_tabs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminal_view_state` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`active_tab_id` text,
	`focused_terminals` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terminals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cwd` text NOT NULL,
	`cols` integer DEFAULT 80 NOT NULL,
	`rows` integer DEFAULT 24 NOT NULL,
	`tmux_session` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`exit_code` integer,
	`tab_id` text,
	`position_in_tab` integer DEFAULT 0,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
