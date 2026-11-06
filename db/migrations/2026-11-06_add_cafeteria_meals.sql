-- =====================================================================
-- 2026-11-06 · 구내식당 메뉴 (홈 화면 · 전체 > 구내식당, 대표 · 관리자가 입력)
--
-- 운영 DB(phpMyAdmin > conastt > SQL 탭)에 한 번만 실행하세요.
-- ⚠️ 이 SQL을 먼저 실행하고 나서 코드를 올려야 해요. (순서가 바뀌면 홈 화면이 오류를 냄)
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `in_meals` (
  `meal_date` date NOT NULL,
  `meal` varchar(10) NOT NULL DEFAULT 'lunch' COMMENT '지금은 lunch(점심)만 씀',
  `items` text NOT NULL COMMENT '메뉴, 한 줄에 하나',
  `updated_by` int DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`meal_date`,`meal`),
  KEY `fk_in_meals_user` (`updated_by`),
  CONSTRAINT `fk_in_meals_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
