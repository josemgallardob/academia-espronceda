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
