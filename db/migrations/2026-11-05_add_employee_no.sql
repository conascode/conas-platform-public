-- =====================================================================
-- 2026-11-05 · 사원번호 칸 추가 (모바일 사원증, 관리자 > 회원에서 입력)
--
-- 운영 DB(phpMyAdmin > conastt > SQL 탭)에 한 번만 실행하세요.
-- ⚠️ 이 SQL을 먼저 실행하고 나서 코드를 올려야 해요. (순서가 바뀌면 앱이 오류를 냄)
-- 이미 실행했다면 "Duplicate column name 'employee_no'" 오류가 나요. 그때는 무시하면 돼요.
-- =====================================================================
SET NAMES utf8mb4;
ALTER TABLE `in_members`
  ADD COLUMN `employee_no` varchar(20) DEFAULT NULL COMMENT '사원번호 (관리자가 입력, 겹치면 안 됨)' AFTER `display_name`,
  ADD UNIQUE KEY `uniq_employee_no` (`employee_no`);
