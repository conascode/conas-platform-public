<?php
defined('IN_APP') or exit;

// 허용 확장자. 이미지(화면에 바로 표시)는 실제 내용도 이미지여야 함.
const ATT_IMAGE_EXT = [
    'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
    'gif' => 'image/gif', 'webp' => 'image/webp',
];
const ATT_FILE_EXT = [
    'heic', 'heif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'hwp', 'hwpx', 'txt', 'csv', 'zip', '7z', 'mp4', 'mov', 'mp3', 'm4a',
];
// 확장자가 허용돼도 실제 내용이 이런 형식이면 거부
const ATT_BLOCKED_MIME = [
    'text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml',
    'text/x-php', 'application/x-php', 'application/x-httpd-php', 'text/x-shellscript',
    'application/javascript', 'text/javascript', 'application/x-dosexec',
    'application/x-msdownload', 'application/x-executable', 'application/x-sharedlib',
    'application/x-mach-binary', 'application/java-archive',
];

/** 실제 적용되는 파일 1개 최대 크기 (설정값과 호스팅 PHP 한도 중 작은 값) */
function att_max_bytes(): int
{
    return min(UPLOAD_MAX_BYTES, ini_bytes((string)ini_get('upload_max_filesize')), ini_bytes((string)ini_get('post_max_size')));
}

/** 파일 선택창 형식 목록. heic는 빼서 아이폰이 사진을 JPEG로 바꿔 보내게 함 (화면에 바로 보이도록) */
function att_accept_attr(): string
{
    $ext = array_diff(array_merge(array_keys(ATT_IMAGE_EXT), ATT_FILE_EXT), ['heic', 'heif']);
    return 'image/*,' . implode(',', array_map(fn($x) => '.' . $x, $ext));
}

function att_path(string $stored): string
{
    return rtrim(UPLOAD_DIR, '/\\') . '/' . substr($stored, 0, 2) . '/' . $stored;
}

function att_is_image(string $mime): bool
{
    return in_array($mime, ATT_IMAGE_EXT, true);
}

function att_public(array $a): array
{
    $isImage = att_is_image($a['mime_type']);
    return [
        'id' => (int)$a['id'],
        'name' => $a['original_name'],
        'size' => (int)$a['size_bytes'],
        'size_text' => fmt_bytes((int)$a['size_bytes']),
        'is_image' => $isImage,
        'url' => url('download.php?id=' . (int)$a['id']),
        'view_url' => $isImage ? url('download.php?id=' . (int)$a['id'] . '&inline=1') : null,
    ];
}

/** 업로드된 파일 1개를 저장하고 DB에 기록. 실패하면 RuntimeException(사용자용 메시지) */
function att_store_upload(mixed $file, int $userId): array
{
    if (!is_array($file) || !isset($file['error']) || is_array($file['error'])) {
        throw new RuntimeException('파일을 받지 못했어요.');
    }
    $max = att_max_bytes();
    switch ($file['error']) {
        case UPLOAD_ERR_OK:
            break;
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            throw new RuntimeException('파일이 너무 커요. (최대 ' . fmt_bytes($max) . ')');
        case UPLOAD_ERR_PARTIAL:
            throw new RuntimeException('업로드가 중간에 끊겼어요. 다시 시도해 주세요.');
        case UPLOAD_ERR_NO_FILE:
            throw new RuntimeException('파일을 선택해 주세요.');
        default:
            throw new RuntimeException('서버에서 파일을 저장하지 못했어요. (코드 ' . (int)$file['error'] . ')');
    }
    if (!is_uploaded_file($file['tmp_name'])) {
        throw new RuntimeException('잘못된 업로드예요.');
    }
    $size = (int)$file['size'];
    if ($size <= 0) {
        throw new RuntimeException('빈 파일은 올릴 수 없어요.');
    }
    if ($size > $max) {
        throw new RuntimeException('파일이 너무 커요. (최대 ' . fmt_bytes($max) . ')');
    }

    // 파일명 정리
    $name = (string)$file['name'];
    $name = preg_replace('/[\x00-\x1F\x7F\/\\\\:*?"<>|]/u', '_', $name) ?? 'file';
    $name = trim($name, " .");
    if ($name === '') $name = 'file';
    if (mb_strlen($name) > 200) {
        $ext0 = pathinfo($name, PATHINFO_EXTENSION);
        $name = mb_substr(pathinfo($name, PATHINFO_FILENAME), 0, 180) . ($ext0 !== '' ? '.' . mb_substr($ext0, 0, 10) : '');
    }
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $detected = (string)$finfo->file($file['tmp_name']);

    if (isset(ATT_IMAGE_EXT[$ext])) {
        if (!in_array($detected, ATT_IMAGE_EXT, true)) {
            throw new RuntimeException('이미지 파일이 손상되었거나 형식이 맞지 않아요.');
        }
        $mime = $detected;
    } elseif (in_array($ext, ATT_FILE_EXT, true)) {
        if (in_array($detected, ATT_BLOCKED_MIME, true)) {
            throw new RuntimeException('이 파일은 보안상 올릴 수 없어요.');
        }
        $mime = $detected !== '' ? substr($detected, 0, 100) : 'application/octet-stream';
        if (att_is_image($mime)) {
            // 이미지가 아닌 확장자로 올린 이미지는 일반 파일로 취급
            $mime = 'application/octet-stream';
        }
    } else {
        throw new RuntimeException('올릴 수 없는 파일 형식이에요. (' . ($ext !== '' ? '.' . $ext : '확장자 없음') . ')');
    }

    $stored = bin2hex(random_bytes(16));
    $path = att_path($stored);
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('업로드 폴더를 만들 수 없어요. 관리자에게 문의해 주세요.');
    }
    if (!move_uploaded_file($file['tmp_name'], $path)) {
        throw new RuntimeException('파일을 저장하지 못했어요. 관리자에게 문의해 주세요.');
    }
    @chmod($path, 0644);

    q(
        'INSERT INTO in_attachments (user_id, original_name, stored_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)',
        [$userId, $name, $stored, $mime, $size]
    );
    $id = (int)db()->lastInsertId();

    if (random_int(1, 10) === 1) {
        att_cleanup_orphans();
    }

    return att_public([
        'id' => $id, 'original_name' => $name, 'mime_type' => $mime, 'size_bytes' => $size,
    ]);
}

/** 아직 어디에도 연결되지 않은 첨부파일 조건 */
const ATT_UNLINKED = 'post_id IS NULL AND message_id IS NULL AND approval_id IS NULL AND personal_user_id IS NULL';

/**
 * 아직 연결되지 않은 내 첨부파일을 게시글/메시지/결재 서류/개인 서류에 연결. 연결된 id 목록 반환.
 * $column: 'post_id' | 'message_id' | 'approval_id' | 'personal_user_id'
 */
function att_claim(array $ids, int $userId, string $column, int $targetId): array
{
    if (!$ids || !in_array($column, ['post_id', 'message_id', 'approval_id', 'personal_user_id'], true)) {
        return [];
    }
    $rows = q(
        'SELECT id FROM in_attachments WHERE id IN (' . in_list($ids) . ') AND user_id = ? AND ' . ATT_UNLINKED,
        array_merge($ids, [$userId])
    )->fetchAll(PDO::FETCH_COLUMN);
    if (!$rows) {
        return [];
    }
    q(
        "UPDATE in_attachments SET $column = ? WHERE id IN (" . in_list($rows) . ')',
        array_merge([$targetId], $rows)
    );
    return array_map('intval', $rows);
}

function att_for_posts(array $postIds): array
{
    if (!$postIds) return [];
    $out = [];
    foreach (q('SELECT * FROM in_attachments WHERE post_id IN (' . in_list($postIds) . ') ORDER BY id', $postIds) as $a) {
        $out[(int)$a['post_id']][] = att_public($a);
    }
    return $out;
}

function att_for_messages(array $msgIds): array
{
    if (!$msgIds) return [];
    $out = [];
    foreach (q('SELECT * FROM in_attachments WHERE message_id IN (' . in_list($msgIds) . ') ORDER BY id', $msgIds) as $a) {
        $out[(int)$a['message_id']][] = att_public($a);
    }
    return $out;
}

function att_delete_rows(array $rows): void
{
    foreach ($rows as $a) {
        $p = att_path($a['stored_name']);
        if (is_file($p)) @unlink($p);
        q('DELETE FROM in_attachments WHERE id = ?', [(int)$a['id']]);
    }
}

/** 하루 이상 어디에도 연결되지 않은 파일 정리 (글을 쓰다 그만둔 경우) */
function att_cleanup_orphans(): void
{
    $rows = q(
        'SELECT id, stored_name FROM in_attachments
          WHERE ' . ATT_UNLINKED . ' AND created_at < NOW() - INTERVAL 1 DAY
          LIMIT 100'
    )->fetchAll();
    att_delete_rows($rows);
}
