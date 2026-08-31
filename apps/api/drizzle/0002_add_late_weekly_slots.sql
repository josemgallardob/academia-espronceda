INSERT OR IGNORE INTO `weekly_slots` (`id`, `day_of_week`, `start_time`, `end_time`) VALUES
  ('slot-monday-2000', 'MONDAY', '20:00', '21:00'),
  ('slot-tuesday-2000', 'TUESDAY', '20:00', '21:00'),
  ('slot-wednesday-2000', 'WEDNESDAY', '20:00', '21:00'),
  ('slot-thursday-2000', 'THURSDAY', '20:00', '21:00');
--> statement-breakpoint
INSERT OR IGNORE INTO `teacher_available_slots` (`teacher_id`, `slot_id`)
SELECT `teachers`.`id`, `weekly_slots`.`id`
FROM `teachers`
INNER JOIN `weekly_slots` ON `weekly_slots`.`id` IN (
  'slot-monday-2000',
  'slot-tuesday-2000',
  'slot-wednesday-2000',
  'slot-thursday-2000'
)
WHERE `teachers`.`profile` = 'SENIOR_SCIENCES';
--> statement-breakpoint
INSERT OR IGNORE INTO `teacher_available_slots` (`teacher_id`, `slot_id`)
SELECT `teachers`.`id`, `weekly_slots`.`id`
FROM `teachers`
INNER JOIN `weekly_slots` ON `weekly_slots`.`id` IN (
  'slot-tuesday-2000',
  'slot-thursday-2000'
)
WHERE `teachers`.`profile` = 'GENERAL_SCIENCES';
--> statement-breakpoint
INSERT OR IGNORE INTO `schedule_slots` (
  `schedule_id`,
  `slot_id`,
  `day_of_week`,
  `start_time`,
  `end_time`
)
SELECT
  `schedules`.`id`,
  `weekly_slots`.`id`,
  `weekly_slots`.`day_of_week`,
  `weekly_slots`.`start_time`,
  `weekly_slots`.`end_time`
FROM `schedules`
INNER JOIN `weekly_slots` ON `weekly_slots`.`id` IN (
  'slot-monday-2000',
  'slot-tuesday-2000',
  'slot-wednesday-2000',
  'slot-thursday-2000'
);
