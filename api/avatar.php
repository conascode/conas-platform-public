<?php
/*
 * 프로필 사진 저장/삭제
 *  POST (multipart) file=잘라낸 사진   → 저장
 *  POST action=delete                → 삭제
 */
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';

if (!is_post()) {
    json_out(['error' => 'POST만 가능해요.'], 405);
}
$u = api_member();
check_csrf();

$old = q('SELECT avatar FROM in_members WHERE user_id = ?', [$u['id']])->fetchColumn();
$old = is_string($old) ? $old : null;

function remove_avatar_file(?string $name): void
{
    if (avatar_valid_name($name)) {
        $p = avatar_dir() . '/' . $name;
        if (is_file($p)) @unlink($p);
    }
}

if (($_POST['action'] ?? '') === 'delete') {
    q('UPDATE in_members SET avatar = NULL WHERE user_id = ?', [$u['id']]);
    remove_avatar_file($old);
    json_out(['ok' => true, 'url' => null]);
}

$f = $_FILES['file'] ?? null;
if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
    json_out(['error' => '사진을 받지 못했어요. 다시 시도해 주세요.'], 400);
}
if ((int)$f['size'] > 5 * 1024 * 1024) {
    json_out(['error' => '사진이 너무 커요.'], 400);
}

$mime = (string)(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
$extByMime = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
if (!isset($extByMime[$mime])) {
    json_out(['error' => 'JPG, PNG, WEBP 사진만 쓸 수 있어요.'], 400);
}
$info = @getimagesize($f['tmp_name']);
if (!$info || $info[0] < 16 || $info[1] < 16 || $info[0] > 6000 || $info[1] > 6000) {
    json_out(['error' => '사진 파일이 손상되었거나 크기가 맞지 않아요.'], 400);
}

$data = (string)file_get_contents($f['tmp_name']);
$ext = $extByMime[$mime];

// GD가 있으면 512x512 JPEG로 다시 만들어 저장 (사진 속 위치정보 등 메타데이터도 제거됨)
if (function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
    $src = @imagecreatefromstring($data);
    if ($src) {
        $w = imagesx($src);
        $h = imagesy($src);
        $side = min($w, $h);
        $dst = imagecreatetruecolor(512, 512);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $src, 0, 0, (int)(($w - $side) / 2), (int)(($h - $side) / 2), 512, 512, $side, $side);
        ob_start();
        imagejpeg($dst, null, 86);
        $data = (string)ob_get_clean();
        imagedestroy($src);
        imagedestroy($dst);
        $ext = 'jpg';
    }
}

$dir = avatar_dir();
if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
    json_out(['error' => '사진 폴더를 만들 수 없어요. 관리자에게 문의해 주세요.'], 500);
}
$name = $u['id'] . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
if (file_put_contents($dir . '/' . $name, $data) === false) {
    json_out(['error' => '사진을 저장하지 못했어요. 관리자에게 문의해 주세요.'], 500);
}
@chmod($dir . '/' . $name, 0644);

q('UPDATE in_members SET avatar = ? WHERE user_id = ?', [$name, $u['id']]);
if ($old !== $name) {
    remove_avatar_file($old);
}

json_out(['ok' => true, 'url' => avatar_url($u['id'], $name)]);
