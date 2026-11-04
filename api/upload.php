<?php
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/attachments.php';

if (!is_post()) {
    json_out(['error' => 'POST만 가능해요.'], 405);
}

// 업로드가 post_max_size를 넘으면 PHP가 본문을 통째로 버림
$len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($len > ini_bytes((string)ini_get('post_max_size'))) {
    json_out(['error' => '파일이 너무 커요. (최대 ' . fmt_bytes(att_max_bytes()) . ')'], 413);
}

$u = api_member();
check_csrf();

try {
    $att = att_store_upload($_FILES['file'] ?? null, $u['id']);
    json_out(['file' => $att]);
} catch (RuntimeException $ex) {
    json_out(['error' => $ex->getMessage()], 400);
}
