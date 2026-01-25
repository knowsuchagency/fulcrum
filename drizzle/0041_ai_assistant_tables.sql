CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`provider` text DEFAULT 'claude' NOT NULL,
	`model` text,
	`worktree_path` text NOT NULL,
	`branch` text NOT NULL,
	`dev_port` integer,
	`project_id` text,
	`context` text,
	`is_favorite` integer DEFAULT false,
	`message_count` integer DEFAULT 0,
	`last_message_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`artifacts` text,
	`model` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`message_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`version` integer DEFAULT 1,
	`preview_path` text,
	`content_path` text NOT NULL,
	`is_favorite` integer DEFAULT false,
	`tags` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
