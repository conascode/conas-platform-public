<?php
// 프로필 사진 보여주기 (주소에 버전이 들어 있어 오래 캐시해도 안전)
require __DIR__ . '/inc/bootstrap.php';

require_member();
session_write_close();

$uid = (int)($_GET['u'] ?? 0);
$name = q('SELECT avatar FROM in_members WHERE user_id = ?', [$uid])->fetchColumn();
if (!is_string($name) || !avatar_valid_name($name)) {
    http_response_code(404);
    exit;
}
$path = avatar_dir() . '/' . $name;
if (!is_file($path)) {
    http_response_code(404);
    exit;
}

$types = ['jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
while (ob_get_level() > 0) {
    ob_end_clean();
}
header('Content-Type: ' . $types[pathinfo($name, PATHINFO_EXTENSION)]);
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=31536000, immutable');
header("Content-Security-Policy: default-src 'none'; sandbox");
readfile($path);
