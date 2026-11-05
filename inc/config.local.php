<?php
// 내 컴퓨터(Laragon) 테스트 전용 설정. 서버에는 올리지 마세요.
defined('IN_APP') or exit;

const DB_HOST = '127.0.0.1';
const DB_NAME = 'conas_dev';
const DB_USER = 'root';
const DB_PASS = '';

const APP_NAME       = 'CONAS 사내';
const APP_SHORT_NAME = 'CONAS';
const APP_VERSION    = '2.0.6-dev1';
const BASE_PATH      = '/in';
const THEME_COLOR    = '#2f5bea';

const UPLOAD_DIR       = __DIR__ . '/../../dev_uploads';
const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

const REMEMBER_DAYS = 60;
const PUSH_CONTACT_EMAIL = 'admin@conas.kr';
