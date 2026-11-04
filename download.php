<?php
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/attachments.php';

$u = require_member();
session_write_close();

$id = (int)($_GET['id'] ?? 0);
$a = q('SELECT * FROM in_attachments WHERE id = ?', [$id])->fetch();
if (!$a) {
    not_found('파일을 찾을 수 없어요.');
}

// 권한 확인
$allowed = false;
if ($a['post_id'] !== null) {
    $p = q(
        'SELECT p.deleted_at, b.is_visible FROM in_posts p JOIN in_boards b ON b.id = p.board_id WHERE p.id = ?',
        [(int)$a['post_id']]
    )->fetch();
    $allowed = $p && ($u['is_admin'] || ($p['deleted_at'] === null && (int)$p['is_visible'] === 1));
} elseif ($a['message_id'] !== null) {
    $allowed = (bool)q(
        'SELECT 1 FROM in_messages m
           JOIN in_conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
           JOIN in_conversations c ON c.id = m.conversation_id
          WHERE m.id = ? AND (c.type = \'channel\' OR m.created_at >= cm.joined_at)',
        [$u['id'], (int)$a['message_id']]
    )->fetchColumn();
} elseif ($a['approval_id'] !== null) {
    // 결재 서류 첨부: 올린 사람, 결재자, 대표
    $role = (string)q('SELECT role FROM in_members WHERE user_id = ?', [$u['id']])->fetchColumn();
    $allowed = $role === 'ceo' || (bool)q(
        'SELECT 1 FROM in_approvals ap WHERE ap.id = ? AND (ap.user_id = ? OR EXISTS(
           SELECT 1 FROM in_approval_steps s WHERE s.approval_id = ap.id AND s.approver_id = ?))',
        [(int)$a['approval_id'], $u['id'], $u['id']]
    )->fetchColumn();
} elseif ($a['personal_user_id'] !== null) {
    // 개인 서류(근로계약서 등): 본인, 대표, 관리자
    $role = (string)q('SELECT role FROM in_members WHERE user_id = ?', [$u['id']])->fetchColumn();
    $allowed = (int)$a['personal_user_id'] === $u['id'] || $role === 'ceo' || $u['is_admin'];
} else {
    // 아직 글/메시지에 연결 전: 올린 사람만
    $allowed = $a['user_id'] !== null && (int)$a['user_id'] === $u['id'];
}
if (!$allowed) {
    http_response_code(403);
    exit('이 파일을 볼 권한이 없어요.');
}

$path = att_path($a['stored_name']);
if (!is_file($path)) {
    not_found('파일이 서버에 없어요.');
}

$inline = isset($_GET['inline']) && att_is_image($a['mime_type']);
$name = $a['original_name'];
$fallback = preg_replace('/[^A-Za-z0-9._-]/', '_', $name) ?: 'file';

while (ob_get_level() > 0) {
    ob_end_clean();
}
header('Content-Type: ' . ($inline ? $a['mime_type'] : 'application/octet-stream'));
header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $fallback . '"; filename*=UTF-8\'\'' . rawurlencode($name));
header('Content-Length: ' . filesize($path));
header('Cache-Control: private, max-age=604800');
header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
header('X-Content-Type-Options: nosniff');
readfile($path);
