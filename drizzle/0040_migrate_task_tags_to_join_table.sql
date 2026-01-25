-- Migrate tags from legacy JSON column to task_tags join table
-- Then drop the legacy column

-- Step 1: Insert any missing tags into the tags table
INSERT OR IGNORE INTO `tags` (`id`, `name`, `color`, `created_at`)
SELECT
  lower(hex(randomblob(16))),
  json_each.value,
  NULL,
  datetime('now')
FROM `tasks`, json_each(`tasks`.`tags`)
WHERE `tasks`.`tags` IS NOT NULL
  AND `tasks`.`tags` != '[]'
  AND `tasks`.`tags` != ''
  AND NOT EXISTS (
    SELECT 1 FROM `tags` WHERE `tags`.`name` = json_each.value
  );--> statement-breakpoint

-- Step 2: Create task_tags entries for each tag
INSERT OR IGNORE INTO `task_tags` (`id`, `task_id`, `tag_id`, `created_at`)
SELECT
  lower(hex(randomblob(16))),
  `tasks`.`id`,
  `tags`.`id`,
  datetime('now')
FROM `tasks`, json_each(`tasks`.`tags`)
JOIN `tags` ON `tags`.`name` = json_each.value
WHERE `tasks`.`tags` IS NOT NULL
  AND `tasks`.`tags` != '[]'
  AND `tasks`.`tags` != '';--> statement-breakpoint

-- Step 3: Drop the legacy tags column
ALTER TABLE `tasks` DROP COLUMN `tags`;
