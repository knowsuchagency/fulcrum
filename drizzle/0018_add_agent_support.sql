-- Add agent field and rename claudeOptions to agentOptions
-- This enables support for multiple AI coding agents (Claude, OpenCode, Codex, Gemini)

-- Add agent column with default 'claude' for backward compatibility
ALTER TABLE `tasks` ADD `agent` text NOT NULL DEFAULT 'claude';--> statement-breakpoint
ALTER TABLE `repositories` ADD `agent` text NOT NULL DEFAULT 'claude';--> statement-breakpoint

-- Rename claude_options to agent_options (SQLite doesn't support RENAME COLUMN directly,
-- so we add new column and copy data)
ALTER TABLE `tasks` ADD `agent_options` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `agent_options` text;--> statement-breakpoint

-- Copy existing claude_options data to agent_options
UPDATE `tasks` SET `agent_options` = `claude_options` WHERE `claude_options` IS NOT NULL;--> statement-breakpoint
UPDATE `repositories` SET `agent_options` = `claude_options` WHERE `claude_options` IS NOT NULL;--> statement-breakpoint

-- Drop the old claude_options columns (SQLite 3.35+ required)
ALTER TABLE `tasks` DROP COLUMN `claude_options`;--> statement-breakpoint
ALTER TABLE `repositories` DROP COLUMN `claude_options`;
