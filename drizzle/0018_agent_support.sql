-- Add multi-agent support
-- Tasks: add agent column, rename claude_options to agent_options
-- Repositories: add opencode_options (keep claude_options)

-- Tasks: add agent column with default 'claude'
ALTER TABLE `tasks` ADD `agent` text NOT NULL DEFAULT 'claude';--> statement-breakpoint

-- Tasks: add agent_options column
ALTER TABLE `tasks` ADD `agent_options` text;--> statement-breakpoint

-- Tasks: migrate existing claude_options to agent_options
UPDATE `tasks` SET `agent_options` = `claude_options` WHERE `claude_options` IS NOT NULL;--> statement-breakpoint

-- Tasks: drop old claude_options column
ALTER TABLE `tasks` DROP COLUMN `claude_options`;--> statement-breakpoint

-- Repositories: add opencode_options column (keep claude_options as-is)
ALTER TABLE `repositories` ADD `opencode_options` text;
