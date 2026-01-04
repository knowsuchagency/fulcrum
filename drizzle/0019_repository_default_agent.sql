-- Add default_agent column to repositories
-- Allows setting a preferred AI agent per repository (overrides global default)

ALTER TABLE `repositories` ADD `default_agent` text;
