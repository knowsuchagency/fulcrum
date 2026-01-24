-- Rename task_dependencies to task_relationships and add type column
-- SQLite doesn't support ALTER TABLE RENAME COLUMN, so we need to recreate the table

-- Step 1: Create the new table with updated schema
CREATE TABLE `task_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`related_task_id` text NOT NULL,
	`type` text DEFAULT 'depends_on' NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint

-- Step 2: Copy data from old table to new table
INSERT INTO `task_relationships` (`id`, `task_id`, `related_task_id`, `type`, `created_at`)
SELECT `id`, `task_id`, `depends_on_task_id`, 'depends_on', `created_at`
FROM `task_dependencies`;--> statement-breakpoint

-- Step 3: Drop the old table
DROP TABLE `task_dependencies`;
