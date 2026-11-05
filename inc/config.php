<?php
defined('IN_APP') or exit;

// 내 컴퓨터에서 테스트할 때만 쓰는 설정 (서버에는 올리지 마세요)
// 실수로 올라가도 실제 도메인에서는 무시되도록 내 컴퓨터 주소일 때만 사용
$__host = strtolower((string)($_SERVER['SERVER_NAME'] ?? ''));
if (is_file(__DIR__ . '/config.local.php') && (PHP_SAPI === 'cli-server' || in_array($__host, ['localhost', '127.0.0.1'], true))) {
    require __DIR__ . '/config.local.php';
    return;
}

// ===== 데이터베이스 (호스팅 정보로 바꿔주세요) =====
const DB_HOST = 'localhost';
const DB_NAME = 'conastt';
const DB_USER = 'conastt';
const DB_PASS = 'yunsh##8928';

// ===== 앱 기본 정보 =====
const APP_NAME       = 'CONAS 사내';
const APP_SHORT_NAME = 'CONAS';
const APP_VERSION    = '2.0.8';     // CSS/JS를 수정하면 숫자를 올려주세요 (앱 캐시 갱신)
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
