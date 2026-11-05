<?php
defined('IN_APP') or exit;

/*
 * 게시판
 *  - 익명 여부는 글마다 저장(작성 당시 게시판 설정). 익명 글은 누구에게도(관리자 포함) 작성자를 보내지 않음
 *  - 익명 글의 댓글: 글쓴이는 '글쓴이', 나머지는 처음 댓글 단 순서대로 '익명1', '익명2' ...
 */

function board_for(array $me, int $boardId): array
{
    $b = board_by_id($boardId);
    if (!$b || !can_view_board($b, $me)) fail('게시판을 찾을 수 없어요.', 404);
    return $b;
}

function post_row(array $me, int $id): array
{
    $p = q('SELECT p.*, b.is_visible FROM in_posts p JOIN in_boards b ON b.id = p.board_id WHERE p.id = ? AND p.deleted_at IS NULL', [$id])->fetch();
    if (!$p || (!(int)$p['is_visible'] && !$me['is_admin'])) fail('글을 찾을 수 없어요.', 404);
    return $p;
}

function api_posts(array $me, array $in): array
{
    $b = board_for($me, int_in($in, 'board_id'));
    $before = int_in($in, 'before');
    $search = str_in($in, 'q', 50);
    $where = 'p.board_id = ? AND p.deleted_at IS NULL';
    $params = [(int)$b['id']];
    if ($before > 0) {
        $where .= ' AND p.id < ?';
        $params[] = $before;
    }
    if ($search !== '') {
        $like = '%' . addcslashes($search, '%_\\') . '%';
        $where .= ' AND (p.title LIKE ? OR p.body LIKE ?)';
        array_push($params, $like, $like);
    }
    $rows = q(
        "SELECT p.id, p.user_id, p.is_anonymous, p.title, p.body, p.is_pinned, p.view_count, UNIX_TIMESTAMP(p.created_at) AS ts,
                (SELECT COUNT(*) FROM in_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comments,
                (SELECT COUNT(*) FROM in_post_likes l WHERE l.post_id = p.id) AS likes,
                (SELECT COUNT(*) FROM in_attachments a WHERE a.post_id = p.id) AS files,
                (SELECT a.id FROM in_attachments a WHERE a.post_id = p.id AND a.mime_type IN ('image/jpeg','image/png','image/gif','image/webp') ORDER BY a.id LIMIT 1) AS thumb_id
           FROM in_posts p
          WHERE $where
          ORDER BY " . ($before > 0 || $search !== '' ? '' : 'p.is_pinned DESC, ') . "p.id DESC
          LIMIT 30",
        $params
    )->fetchAll();

    $posts = [];
    foreach ($rows as $r) {
        $anon = (bool)$r['is_anonymous'];
        $uid = $r['user_id'] === null ? null : (int)$r['user_id'];
        $posts[] = [
            'id' => (int)$r['id'],
            'title' => $r['title'],
            'anon' => $anon,
            'author' => $anon ? '익명' : org_name($uid),
            'author_id' => $anon ? null : $uid,
            'mine' => $uid === $me['id'],
            'pinned' => (bool)$r['is_pinned'],
            'ts' => (int)$r['ts'],
            'views' => (int)$r['view_count'],
            'comments' => (int)$r['comments'],
            'likes' => (int)$r['likes'],
            'files' => (int)$r['files'],
            'thumb' => $r['thumb_id'] ? url('download.php?id=' . (int)$r['thumb_id'] . '&inline=1') : null,
        ];
    }
    return [
        'board' => board_info($b) + ['can_write' => can_write_board($b, $me)],
        'posts' => $posts,
        'has_more' => count($rows) === 30,
    ];
}

function board_info(array $b): array
{
    return [
        'id' => (int)$b['id'], 'name' => $b['name'], 'description' => $b['description'],
        'anonymous' => (bool)$b['is_anonymous'], 'allow_comments' => (bool)$b['allow_comments'],
        'allow_attachments' => (bool)$b['allow_attachments'], 'max_files' => (int)$b['max_files'],
    ];
}

function api_post(array $me, array $in): array
{
    $p = post_row($me, int_in($in, 'id'));
    $id = (int)$p['id'];
    $b = board_by_id((int)$p['board_id']);
    $anon = (bool)$p['is_anonymous'];
    $authorId = $p['user_id'] === null ? null : (int)$p['user_id'];

    // 조회수 (내 글은 세지 않음)
    $countView = (int)$p['user_id'] !== $me['id'] && empty($in['no_view']);
    if ($countView) {
        q('UPDATE in_posts SET view_count = view_count + 1 WHERE id = ?', [$id]);
    }

    $comments = q(
        'SELECT c.id, c.parent_id, c.user_id, c.body, c.deleted_at IS NOT NULL AS deleted, UNIX_TIMESTAMP(c.created_at) AS ts,
                (SELECT COUNT(*) FROM in_comment_likes l WHERE l.comment_id = c.id) AS likes,
                EXISTS(SELECT 1 FROM in_comment_likes l WHERE l.comment_id = c.id AND l.user_id = ?) AS liked
           FROM in_comments c WHERE c.post_id = ? ORDER BY c.id',
        [$me['id'], $id]
    )->fetchAll();

    // 익명 번호: 처음 댓글 단 순서
    $anonNo = [];
    $list = [];
    foreach ($comments as $c) {
        $cu = $c['user_id'] === null ? null : (int)$c['user_id'];
        if ($anon) {
            if ($cu !== null && $cu === $authorId) {
                $name = '글쓴이';
            } else {
                $key = $cu ?? 'x' . $c['id'];
                if (!isset($anonNo[$key])) $anonNo[$key] = count($anonNo) + 1;
                $name = '익명' . $anonNo[$key];
            }
        } else {
            $name = org_name($cu);
        }
        $deleted = (bool)$c['deleted'];
        $list[] = [
            'id' => (int)$c['id'],
            'parent_id' => $c['parent_id'] === null ? null : (int)$c['parent_id'],
            'name' => $deleted ? '' : $name,
            'av' => ($anon || $deleted || $cu === null) ? null : avatar_url($cu, org_member($cu)['avatar'] ?? null),
            'user_id' => $anon ? null : $cu,
            'body' => $deleted ? '' : $c['body'],
            'deleted' => $deleted,
            'mine' => $cu === $me['id'],
            'is_author' => $cu !== null && $cu === $authorId,
            'ts' => (int)$c['ts'],
            'likes' => (int)$c['likes'],
            'liked' => (bool)$c['liked'],
        ];
    }

    $likes = (int)q('SELECT COUNT(*) FROM in_post_likes WHERE post_id = ?', [$id])->fetchColumn();
    $liked = (bool)q('SELECT 1 FROM in_post_likes WHERE post_id = ? AND user_id = ?', [$id, $me['id']])->fetchColumn();
    $mine = $authorId === $me['id'];

    return [
        'post' => [
            'id' => $id,
            'board_id' => (int)$p['board_id'],
            'board' => $b['name'],
            'title' => $p['title'],
            'body' => $p['body'],
            'anon' => $anon,
            'author' => $anon ? '익명' : org_name($authorId),
            'author_id' => $anon ? null : $authorId,
            'av' => $anon || !$authorId ? null : avatar_url($authorId, org_member($authorId)['avatar'] ?? null),
            'ts' => strtotime($p['created_at']),
            'edited' => $p['updated_at'] !== null,
            'views' => (int)$p['view_count'] + ($countView ? 1 : 0),
            'likes' => $likes,
            'liked' => $liked,
            'mine' => $mine,
            'can_edit' => $mine,
            'can_delete' => $mine || $me['is_admin'],
            'files' => att_for_posts([$id])[$id] ?? [],
            'allow_comments' => (bool)$b['allow_comments'],
        ],
        'comments' => $list,
    ];
}

function api_post_save(array $me, array $in): array
{
    $id = int_in($in, 'id');
    $title = str_in($in, 'title', 200);
    $body = str_in($in, 'body', 20000);
    $fileIds = int_list_in($in, 'files', 10);
    if ($title === '') fail('제목을 입력해 주세요.');
    if ($body === '') fail('내용을 입력해 주세요.');

    if ($id) {
        $p = post_row($me, $id);
        if ((int)$p['user_id'] !== $me['id']) fail('내가 쓴 글만 고칠 수 있어요.', 403);
        $b = board_by_id((int)$p['board_id']);
        q('UPDATE in_posts SET title = ?, body = ?, updated_at = NOW() WHERE id = ?', [$title, $body, $id]);
        // 지우기로 한 첨부
        $keep = int_list_in($in, 'keep_files', 20);
        $old = q('SELECT * FROM in_attachments WHERE post_id = ?', [$id])->fetchAll();
        att_delete_rows(array_filter($old, fn($a) => !in_array((int)$a['id'], $keep, true)));
        if ($b['allow_attachments']) att_claim($fileIds, $me['id'], 'post_id', $id);
        return ['ok' => true, 'id' => $id];
    }

    $b = board_for($me, int_in($in, 'board_id'));
    if (!can_write_board($b, $me)) fail('이 게시판에는 글을 쓸 수 없어요.', 403);
    q(
        'INSERT INTO in_posts (board_id, user_id, is_anonymous, title, body) VALUES (?, ?, ?, ?, ?)',
        [(int)$b['id'], $me['id'], (int)$b['is_anonymous'], $title, $body]
    );
    $id = (int)db()->lastInsertId();
    if ($b['allow_attachments']) att_claim(array_slice($fileIds, 0, (int)$b['max_files']), $me['id'], 'post_id', $id);

    // 새 글 알림: 이 게시판을 볼 수 있는 직원 모두 (쓴 사람 제외). 익명 게시판이면 이름은 빼고 제목만
    $to = [];
    foreach (org_members() as $m) {
        if ($m['id'] !== $me['id'] && can_view_board($b, $m)) $to[] = $m['id'];
    }
    notify($to, 'post', $b['name'] . '에 새 글이 올라왔어요', ($b['is_anonymous'] ? '' : $me['name'] . ' · ') . $title, '/cm/post/' . $id);

    return ['ok' => true, 'id' => $id];
}

function api_post_delete(array $me, array $in): array
{
    $p = post_row($me, int_in($in, 'id'));
    if ((int)$p['user_id'] !== $me['id'] && !$me['is_admin']) fail('삭제할 권한이 없어요.', 403);
    q('UPDATE in_posts SET deleted_at = NOW() WHERE id = ?', [(int)$p['id']]);
    return ['ok' => true, 'board_id' => (int)$p['board_id']];
}

function api_post_like(array $me, array $in): array
{
    $p = post_row($me, int_in($in, 'id'));
    $id = (int)$p['id'];
    if (bool_in($in, 'like')) {
        q('INSERT IGNORE INTO in_post_likes (post_id, user_id) VALUES (?, ?)', [$id, $me['id']]);
    } else {
        q('DELETE FROM in_post_likes WHERE post_id = ? AND user_id = ?', [$id, $me['id']]);
    }
    return [
        'liked' => (bool)q('SELECT 1 FROM in_post_likes WHERE post_id = ? AND user_id = ?', [$id, $me['id']])->fetchColumn(),
        'count' => (int)q('SELECT COUNT(*) FROM in_post_likes WHERE post_id = ?', [$id])->fetchColumn(),
    ];
}

function api_comment_add(array $me, array $in): array
{
    $p = post_row($me, int_in($in, 'post_id'));
    $b = board_by_id((int)$p['board_id']);
    if (!$b['allow_comments']) fail('이 게시판은 댓글을 달 수 없어요.');
    $body = str_in($in, 'body', 3000);
    if ($body === '') fail('댓글 내용을 입력해 주세요.');
    $parent = int_in($in, 'parent_id') ?: null;
    if ($parent) {
        $pc = q('SELECT id, parent_id FROM in_comments WHERE id = ? AND post_id = ?', [$parent, (int)$p['id']])->fetch();
        if (!$pc) fail('답글을 달 댓글을 찾을 수 없어요.');
        // 답글은 한 단계까지
        if ($pc['parent_id'] !== null) $parent = (int)$pc['parent_id'];
    }
    q('INSERT INTO in_comments (post_id, parent_id, user_id, body) VALUES (?, ?, ?, ?)', [(int)$p['id'], $parent, $me['id'], $body]);

    // 글쓴이에게 알림 (익명 글이면 댓글 단 사람 이름은 숨김)
    $author = $p['user_id'] === null ? null : (int)$p['user_id'];
    if ($author && $author !== $me['id']) {
        notify($author, 'comment', '내 글에 댓글이 달렸어요', mb_strimwidth($p['title'], 0, 60, '…'), '/cm/post/' . (int)$p['id']);
    }
    return api_post($me, ['id' => (int)$p['id'], 'no_view' => 1]);
}

function api_comment_delete(array $me, array $in): array
{
    $c = q('SELECT id, post_id, user_id FROM in_comments WHERE id = ? AND deleted_at IS NULL', [int_in($in, 'id')])->fetch();
    if (!$c) fail('댓글을 찾을 수 없어요.', 404);
    if ((int)$c['user_id'] !== $me['id'] && !$me['is_admin']) fail('삭제할 권한이 없어요.', 403);
    q('UPDATE in_comments SET deleted_at = NOW() WHERE id = ?', [(int)$c['id']]);
    return api_post($me, ['id' => (int)$c['post_id'], 'no_view' => 1]);
}

function api_comment_like(array $me, array $in): array
{
    $c = q('SELECT id, post_id FROM in_comments WHERE id = ? AND deleted_at IS NULL', [int_in($in, 'id')])->fetch();
    if (!$c) fail('댓글을 찾을 수 없어요.', 404);
    post_row($me, (int)$c['post_id']);
    $id = (int)$c['id'];
    if (bool_in($in, 'like')) {
        q('INSERT IGNORE INTO in_comment_likes (comment_id, user_id) VALUES (?, ?)', [$id, $me['id']]);
    } else {
        q('DELETE FROM in_comment_likes WHERE comment_id = ? AND user_id = ?', [$id, $me['id']]);
    }
    return [
        'liked' => (bool)q('SELECT 1 FROM in_comment_likes WHERE comment_id = ? AND user_id = ?', [$id, $me['id']])->fetchColumn(),
        'count' => (int)q('SELECT COUNT(*) FROM in_comment_likes WHERE comment_id = ?', [$id])->fetchColumn(),
    ];
}
