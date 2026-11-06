-- =====================================================================
-- 2026-11-06 (2) · 모바일 사원증 바코드 확인 기록 (reader.php)
--
-- 운영 DB(phpMyAdmin > conastt > SQL 탭)에 한 번만 실행하세요.
-- ⚠️ 이 SQL을 먼저 실행하고 나서 코드를 올려야 해요. (순서가 바뀌면 리더기가 오류를 냄)
-- 바코드를 만드는 비밀키는 처음 쓸 때 in_settings('idcard_key')에 자동으로 만들어져요.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `in_idcard_scans` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL COMMENT '찍힌 사원증의 주인 (없는 코드면 NULL)',
  `scanned_by` int DEFAULT NULL COMMENT '리더기를 쓴 사람',
  `result` varchar(10) NOT NULL COMMENT 'ok, expired, invalid, inactive',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`,`id`),
  KEY `idx_time` (`created_at`),
  KEY `fk_in_scan_by` (`scanned_by`),
  CONSTRAINT `fk_in_scan_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_in_scan_by` FOREIGN KEY (`scanned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
