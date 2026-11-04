<?php
defined('IN_APP') or exit;

// ===== 데이터베이스 (호스팅 정보로 바꿔주세요) =====
const DB_HOST = 'conas.kr';
const DB_NAME = 'conastt';
const DB_USER = '';
const DB_PASS = '';

// ===== 앱 기본 정보 =====
const APP_NAME       = 'CONAS 사내';
const APP_SHORT_NAME = 'CONAS';
const APP_VERSION    = '1.0.2';     // CSS/JS를 수정하면 숫자를 올려주세요 (앱 캐시 갱신)
const BASE_PATH      = '/in';       // conas.kr/in/
const THEME_COLOR    = '#2f5bea';

// ===== 첨부파일 =====
// 가능하면 웹에서 접근할 수 없는 경로(public_html 바깥)로 바꾸세요.
// 예: '/home/계정명/in_uploads'
const UPLOAD_DIR       = __DIR__ . '/../uploads';
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;   // 파일 1개 최대 20MB (호스팅 PHP 설정이 더 작으면 그 값이 적용됨)

// ===== 로그인 =====
const REMEMBER_DAYS = 60;   // '로그인 유지' 기간

// ===== 푸시 알림 =====
// 푸시 서비스(구글, 애플)가 문제 발생 시 연락할 주소. 실제로 받을 수 있는 회사 메일로 바꿔주세요.
const PUSH_CONTACT_EMAIL = 'admin@conas.kr';
