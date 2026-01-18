-- Rename labels table to tags
ALTER TABLE `labels` RENAME TO `tags`;--> statement-breakpoint
-- Rename the unique index on name
DROP INDEX IF EXISTS `labels_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
-- Rename task_labels table to task_tags and update column name
ALTER TABLE `task_labels` RENAME TO `task_tags`;--> statement-breakpoint
ALTER TABLE `task_tags` RENAME COLUMN `label_id` TO `tag_id`;--> statement-breakpoint
-- Rename project_labels table to project_tags and update column name
ALTER TABLE `project_labels` RENAME TO `project_tags`;--> statement-breakpoint
ALTER TABLE `project_tags` RENAME COLUMN `label_id` TO `tag_id`;
