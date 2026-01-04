-- Add opencode_model column to repositories and tasks tables
-- This stores the preferred OpenCode model (e.g., 'anthropic/claude-opus-4-5')
-- For repositories: NULL means use global default from settings
-- For tasks: NULL means use repository default, then global default

ALTER TABLE `repositories` ADD `opencode_model` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `opencode_model` text;
