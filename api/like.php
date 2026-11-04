<?php
// 게시글 좋아요 켜기/끄기 (JSON) { post_id, like: true|false }
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';

if (!is_post()) {
    json_out(['error' => 'POST만 가능해요.'], 405);
}
$u = api_member();
check_csrf();

$in = json_input();
$postId = int_in($in, 'post_id');
$post = q('SELECT p.id, p.board_id FROM in_posts p WHERE p.id = ? AND p.deleted_at IS NULL', [$postId])->fetch();
$board = $post ? board_by_id((int)$post['board_id']) : null;
if (!$post || !$board || !can_view_board($board, $u)) {
    json_out(['error' => '글을 찾을 수 없어요.'], 404);
}

if (!empty($in['like'])) {
    q('INSERT IGNORE INTO in_post_likes (post_id, user_id) VALUES (?, ?)', [$postId, $u['id']]);
} else {
    q('DELETE FROM in_post_likes WHERE post_id = ? AND user_id = ?', [$postId, $u['id']]);
}

$count = (int)q('SELECT COUNT(*) FROM in_post_likes WHERE post_id = ?', [$postId])->fetchColumn();
$liked = (bool)q('SELECT 1 FROM in_post_likes WHERE post_id = ? AND user_id = ?', [$postId, $u['id']])->fetchColumn();
json_out(['liked' => $liked, 'count' => $count]);
