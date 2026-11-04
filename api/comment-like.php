<?php
// 댓글 좋아요 켜기/끄기 (JSON) { comment_id, like: true|false }
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';

if (!is_post()) {
    json_out(['error' => 'POST만 가능해요.'], 405);
}
$u = api_member();
check_csrf();

$in = json_input();
$cid = int_in($in, 'comment_id');
$row = q(
    'SELECT c.id, p.board_id FROM in_comments c JOIN in_posts p ON p.id = c.post_id
      WHERE c.id = ? AND c.deleted_at IS NULL AND p.deleted_at IS NULL',
    [$cid]
)->fetch();
$board = $row ? board_by_id((int)$row['board_id']) : null;
if (!$row || !$board || !can_view_board($board, $u)) {
    json_out(['error' => '댓글을 찾을 수 없어요.'], 404);
}

if (!empty($in['like'])) {
    q('INSERT IGNORE INTO in_comment_likes (comment_id, user_id) VALUES (?, ?)', [$cid, $u['id']]);
} else {
    q('DELETE FROM in_comment_likes WHERE comment_id = ? AND user_id = ?', [$cid, $u['id']]);
}

$count = (int)q('SELECT COUNT(*) FROM in_comment_likes WHERE comment_id = ?', [$cid])->fetchColumn();
$liked = (bool)q('SELECT 1 FROM in_comment_likes WHERE comment_id = ? AND user_id = ?', [$cid, $u['id']])->fetchColumn();
json_out(['liked' => $liked, 'count' => $count]);
