-- Split repository agent options by agent type
-- This removes the agent selector from repos (now a global setting)
-- and stores options separately for each supported agent

-- Add per-agent options columns
ALTER TABLE `repositories` ADD `claude_options` text;--> statement-breakpoint
ALTER TABLE `repositories` ADD `opencode_options` text;--> statement-breakpoint

-- Migrate existing agent_options to the appropriate column based on agent type
UPDATE `repositories` SET `claude_options` = `agent_options` WHERE `agent` = 'claude' AND `agent_options` IS NOT NULL;--> statement-breakpoint
UPDATE `repositories` SET `opencode_options` = `agent_options` WHERE `agent` = 'opencode' AND `agent_options` IS NOT NULL;--> statement-breakpoint

-- Drop the old agent and agent_options columns (SQLite 3.35+ required)
ALTER TABLE `repositories` DROP COLUMN `agent`;--> statement-breakpoint
ALTER TABLE `repositories` DROP COLUMN `agent_options`;
