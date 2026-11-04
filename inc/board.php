<?php
defined('IN_APP') or exit;

/** 게시글 목록 조회용 SELECT (썸네일, 댓글 수, 첨부 수, 새 글 여부 포함) */
function post_list_select(): string
{
    return "SELECT p.id, p.board_id, p.title, p.is_pinned, p.view_count, p.created_at,
                   (p.created_at >= NOW() - INTERVAL 1 DAY) AS is_new,
                   b.name AS board_name, u.username, m.display_name,
                   (SELECT COUNT(*) FROM in_comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) AS comment_count,
                   (SELECT COUNT(*) FROM in_attachments a WHERE a.post_id = p.id) AS file_count,
                   (SELECT COUNT(*) FROM in_post_likes l WHERE l.post_id = p.id) AS like_count,
                   (SELECT a.id FROM in_attachments a
                     WHERE a.post_id = p.id AND a.mime_type IN ('image/jpeg','image/png','image/gif','image/webp')
                     ORDER BY a.id LIMIT 1) AS thumb_id
              FROM in_posts p
              JOIN in_boards b ON b.id = p.board_id
              LEFT JOIN users u ON u.id = p.user_id
              LEFT JOIN in_members m ON m.user_id = p.user_id";
}

/** 네이버 카페 스타일 목록 한 줄 */
function render_post_row(array $p, array $opt = []): void
{
    $notice = !empty($opt['notice']);
    $showBoard = !empty($opt['show_board']);
    $thumb = (!$notice && $p['thumb_id']) ? url('download.php?id=' . (int)$p['thumb_id'] . '&inline=1') : null;
    $comments = (int)$p['comment_count'];
    ?>
    <li class="post-row<?= $notice ? ' is-notice' : '' ?>">
      <a href="<?= e(url('post.php?id=' . (int)$p['id'])) ?>">
        <div class="post-row-main">
          <p class="post-row-title">
            <?php if ($notice): ?><span class="notice-badge">공지</span><?php endif; ?>
            <span class="t"><?= e($p['title']) ?></span>
            <?php if (!$notice && (int)$p['is_new'] === 1): ?><span class="new-mark" aria-label="새 글">N</span><?php endif; ?>
            <?php if (!$thumb && (int)$p['file_count'] > 0): ?><span class="clip" aria-label="첨부파일 있음"><?= icon('clip') ?></span><?php endif; ?>
          </p>
          <?php if (!$notice): ?>
            <p class="meta">
              <?php if ($showBoard): ?><span class="meta-board"><?= e($p['board_name']) ?></span><?php endif; ?>
              <span><?= e(user_label($p)) ?></span>
              <span><?= e(fmt_date($p['created_at'])) ?></span>
              <span>조회 <?= (int)$p['view_count'] ?></span>
              <?php if ((int)$p['like_count'] > 0): ?><span class="meta-like">좋아요 <?= (int)$p['like_count'] ?></span><?php endif; ?>
            </p>
          <?php endif; ?>
        </div>
        <?php if ($thumb): ?>
          <span class="post-row-thumb">
            <img src="<?= e($thumb) ?>" alt="" loading="lazy" decoding="async">
          </span>
        <?php endif; ?>
        <?php if (!$notice && $comments > 0): ?>
          <span class="cmt-box" aria-label="댓글 <?= $comments ?>개"><b><?= $comments > 999 ? '999+' : $comments ?></b><small>댓글</small></span>
        <?php endif; ?>
      </a>
    </li>
    <?php
}
