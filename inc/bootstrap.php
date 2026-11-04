<?php
declare(strict_types=1);

define('IN_APP', true);
require __DIR__ . '/config.php';

date_default_timezone_set('Asia/Seoul');
mb_internal_encoding('UTF-8');

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('X-Frame-Options: SAMEORIGIN');

// ---------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------
function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $pdo->exec("SET time_zone = '+09:00'");
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

/** IN (?, ?, ?) 용 자리표시자 */
function in_list(array $values): string
{
    return implode(',', array_fill(0, max(1, count($values)), '?'));
}

function setting_get(string $k): ?string
{
    $v = q('SELECT v FROM in_settings WHERE k = ?', [$k])->fetchColumn();
    return $v === false ? null : (string)$v;
}

// ---------------------------------------------------------------------
// 공통 도우미
// ---------------------------------------------------------------------
function e(?string $s): string
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function url(string $path = ''): string
{
    return BASE_PATH . '/' . ltrim($path, '/');
}

function asset(string $path): string
{
    return url('assets/' . $path) . '?v=' . rawurlencode(APP_VERSION);
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

function is_post(): bool
{
    return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}

function is_api(): bool
{
    return defined('IS_API');
}

function redirect(string $path): never
{
    if (!str_starts_with($path, '/') && !preg_match('#^https?://#', $path)) {
        $path = url($path);
    }
    header('Location: ' . $path);
    exit;
}

/** 로그인 후 돌아갈 주소 (같은 앱 안의 경로만 허용) */
function safe_next(?string $next): string
{
    $next = (string)$next;
    if ($next !== '' && str_starts_with($next, BASE_PATH . '/') && !str_contains($next, '//') && !str_contains($next, '\\')) {
        return $next;
    }
    return url('');
}

function json_out(mixed $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/** 응답을 먼저 보내고 남은 작업(푸시 발송 등)을 계속한다 */
function json_send_and_continue(mixed $data): void
{
    $body = (string)json_encode($data, JSON_UNESCAPED_UNICODE);
    ignore_user_abort(true);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    // 출력 압축이 켜져 있으면 길이가 달라져 응답이 멈출 수 있으므로 그때는 생략
    if (!function_exists('fastcgi_finish_request') && !ini_get('zlib.output_compression') && ob_get_level() === 0) {
        header('Content-Length: ' . strlen($body));
        header('Connection: close');
    }
    echo $body;
    if (function_exists('fastcgi_finish_request')) {
        fastcgi_finish_request();
    } else {
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        flush();
    }
}

function json_input(): array
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw ?: '[]', true);
        if (!is_array($data)) {
            $data = [];
        }
    }
    return $data;
}

function str_in(array $src, string $key, int $max = 0): string
{
    $v = $src[$key] ?? '';
    if (!is_string($v)) {
        return '';
    }
    // 제어문자 제거 (줄바꿈, 탭은 유지 / 이모지 조합 문자는 유지)
    $v = preg_replace('/[^\P{Cc}\n\t]/u', '', str_replace("\r\n", "\n", $v)) ?? '';
    $v = trim($v);
    if ($max > 0 && mb_strlen($v) > $max) {
        $v = mb_substr($v, 0, $max);
    }
    return $v;
}

function int_in(array $src, string $key): int
{
    $v = $src[$key] ?? 0;
    return is_numeric($v) ? (int)$v : 0;
}

function int_list_in(array $src, string $key, int $max = 50): array
{
    $v = $src[$key] ?? [];
    if (!is_array($v)) {
        return [];
    }
    $out = [];
    foreach ($v as $x) {
        if (is_numeric($x) && (int)$x > 0) {
            $out[(int)$x] = true;
        }
    }
    return array_slice(array_keys($out), 0, $max);
}

function flash(string $msg, string $type = 'info'): void
{
    $_SESSION['flash'][] = [$type, $msg];
}

function take_flashes(): array
{
    $f = $_SESSION['flash'] ?? [];
    unset($_SESSION['flash']);
    return is_array($f) ? $f : [];
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function fmt_bytes(int $b): string
{
    if ($b >= 1073741824) return round($b / 1073741824, 1) . 'GB';
    if ($b >= 1048576) return round($b / 1048576, 1) . 'MB';
    if ($b >= 1024) return round($b / 1024) . 'KB';
    return $b . 'B';
}

function ini_bytes(string $v): int
{
    $v = trim($v);
    if ($v === '' || $v === '-1') return PHP_INT_MAX;
    $n = (int)$v;
    return match (strtolower(substr($v, -1))) {
        'g' => $n * 1073741824,
        'm' => $n * 1048576,
        'k' => $n * 1024,
        default => $n,
    };
}

/** 목록용 짧은 날짜: 오늘이면 시간, 올해면 월.일, 아니면 연.월.일 */
function fmt_date(?string $dt): string
{
    if (!$dt) return '';
    $t = strtotime($dt);
    if (date('Y-m-d', $t) === date('Y-m-d')) return date('H:i', $t);
    if (date('Y', $t) === date('Y')) return date('m.d', $t);
    return date('Y.m.d', $t);
}

/** 글 보기용 짧은 날짜: 올해면 11/01 10:39, 아니면 2025/11/01 10:39 */
function fmt_short_datetime(?string $dt): string
{
    if (!$dt) return '';
    $t = strtotime($dt);
    return date(date('Y', $t) === date('Y') ? 'm/d H:i' : 'Y/m/d H:i', $t);
}

function fmt_datetime(?string $dt): string
{
    return $dt ? date('Y.m.d H:i', strtotime($dt)) : '';
}

/** 텍스트를 안전하게 HTML로 바꾸고 링크를 자동 연결 */
function text_html(string $s): string
{
    $h = e($s);
    $h = preg_replace_callback(
        '~\bhttps?://[^\s<]+~u',
        function ($m) {
            $u = rtrim($m[0], '.,);!?');
            $tail = substr($m[0], strlen($u));
            return '<a href="' . $u . '" target="_blank" rel="noopener noreferrer">' . $u . '</a>' . $tail;
        },
        $h
    ) ?? $h;
    return nl2br($h, false);
}

// ---------------------------------------------------------------------
// 프로필 사진
// ---------------------------------------------------------------------
function avatar_dir(): string
{
    return rtrim(UPLOAD_DIR, '/\\') . '/avatars';
}

function avatar_valid_name(?string $name): bool
{
    return $name !== null && (bool)preg_match('/^\d+_[a-f0-9]{12}\.(jpg|png|webp)$/', $name);
}

function avatar_url(?int $uid, ?string $avatar): ?string
{
    return ($uid && avatar_valid_name($avatar)) ? url('avatar.php?u=' . $uid . '&v=' . rawurlencode((string)$avatar)) : null;
}

/** 동그란 프로필: 사진이 있으면 사진, 없으면 이름 첫 글자 */
function avatar_html(?int $uid, ?string $avatar, string $name, string $class = ''): string
{
    $cls = trim('avatar ' . $class);
    $src = avatar_url($uid, $avatar);
    if ($src) {
        return '<span class="' . e($cls) . ' has-img" aria-hidden="true"><img src="' . e($src) . '" alt="" loading="lazy" decoding="async"></span>';
    }
    return '<span class="' . e($cls) . '" aria-hidden="true">' . e(mb_substr($name, 0, 1)) . '</span>';
}

function user_label(?array $row, string $nameKey = 'display_name', string $usernameKey = 'username'): string
{
    if (!$row || ($row[$usernameKey] ?? null) === null) {
        return '(알 수 없음)';
    }
    $n = trim((string)($row[$nameKey] ?? ''));
    return $n !== '' ? $n : (string)$row[$usernameKey];
}

// ---------------------------------------------------------------------
// 세션 / CSRF
// ---------------------------------------------------------------------
session_name('IN_SESSID');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => BASE_PATH . '/',
    'secure' => is_https(),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

function check_csrf(): void
{
    $t = $_POST['_csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!is_string($t) || !hash_equals(csrf_token(), $t)) {
        if (is_api()) {
            json_out(['error' => '보안 토큰이 만료되었습니다. 다시 시도해 주세요.', 'csrf' => csrf_token()], 419);
        }
        flash('보안 토큰이 만료되었습니다. 다시 시도해 주세요.', 'error');
        $back = $_SERVER['HTTP_REFERER'] ?? '';
        redirect(safe_next(parse_url($back, PHP_URL_PATH) . (($qs = parse_url($back, PHP_URL_QUERY)) ? '?' . $qs : '')));
    }
}

// ---------------------------------------------------------------------
// 인증
// ---------------------------------------------------------------------
const REMEMBER_COOKIE = 'IN_REMEMBER';

function set_remember_cookie(string $value, int $expires): void
{
    setcookie(REMEMBER_COOKIE, $value, [
        'expires' => $expires,
        'path' => BASE_PATH . '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function remember_login(): ?int
{
    $c = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if (!is_string($c) || !preg_match('/^([a-f0-9]{24}):([a-f0-9]{64})$/', $c, $m)) {
        return null;
    }
    $row = q('SELECT user_id, validator_hash FROM in_remember_tokens WHERE selector = ? AND expires_at > NOW()', [$m[1]])->fetch();
    if (!$row || !hash_equals($row['validator_hash'], hash('sha256', $m[2]))) {
        set_remember_cookie('', time() - 3600);
        return null;
    }
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$row['user_id'];
    // 사용할 때마다 기간 연장 (토큰 값은 바꾸지 않음: 동시 요청 시 로그아웃되는 문제 방지)
    q('UPDATE in_remember_tokens SET expires_at = DATE_ADD(NOW(), INTERVAL ' . REMEMBER_DAYS . ' DAY) WHERE selector = ?', [$m[1]]);
    set_remember_cookie($c, time() + REMEMBER_DAYS * 86400);
    return (int)$row['user_id'];
}

function login_user(int $uid, bool $remember): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = $uid;
    unset($_SESSION['csrf']);
    if ($remember) {
        $selector = bin2hex(random_bytes(12));
        $validator = bin2hex(random_bytes(32));
        q(
            'INSERT INTO in_remember_tokens (selector, user_id, validator_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ' . REMEMBER_DAYS . ' DAY))',
            [$selector, $uid, hash('sha256', $validator)]
        );
        set_remember_cookie($selector . ':' . $validator, time() + REMEMBER_DAYS * 86400);
    }
    q('DELETE FROM in_remember_tokens WHERE expires_at < NOW()');
}

function logout_user(): void
{
    $c = $_COOKIE[REMEMBER_COOKIE] ?? '';
    if (is_string($c) && preg_match('/^([a-f0-9]{24}):/', $c, $m)) {
        q('DELETE FROM in_remember_tokens WHERE selector = ?', [$m[1]]);
    }
    set_remember_cookie('', time() - 3600);
    $_SESSION = [];
    session_regenerate_id(true);
}

function current_user(): ?array
{
    static $loaded = false;
    static $user = null;
    if ($loaded) {
        return $user;
    }
    $loaded = true;

    $uid = isset($_SESSION['uid']) ? (int)$_SESSION['uid'] : null;
    if (!$uid) {
        $uid = remember_login();
    }
    if (!$uid) {
        return null;
    }
    $row = q(
        'SELECT u.id, u.username, u.email, m.display_name, m.avatar, m.status, m.is_admin
           FROM users u JOIN in_members m ON m.user_id = u.id
          WHERE u.id = ?',
        [$uid]
    )->fetch();
    if (!$row) {
        unset($_SESSION['uid']);
        return null;
    }
    $row['id'] = (int)$row['id'];
    $row['is_admin'] = (bool)$row['is_admin'];
    $row['name'] = user_label($row);
    $user = $row;
    return $user;
}

function require_login(): array
{
    $u = current_user();
    if (!$u) {
        if (is_api()) {
            json_out(['error' => '로그인이 필요합니다.', 'login' => true], 401);
        }
        redirect('login.php?next=' . rawurlencode($_SERVER['REQUEST_URI'] ?? url('')));
    }
    return $u;
}

/** 승인된(active) 회원만 통과 */
function require_member(): array
{
    $u = require_login();
    if ($u['status'] !== 'active') {
        if (is_api()) {
            json_out(['error' => '승인된 회원만 이용할 수 있습니다.', 'pending' => true], 403);
        }
        redirect('pending.php');
    }
    return $u;
}

function require_admin(): array
{
    $u = require_member();
    if (!$u['is_admin']) {
        if (is_api()) {
            json_out(['error' => '관리자만 이용할 수 있습니다.'], 403);
        }
        http_response_code(403);
        exit('관리자만 이용할 수 있습니다.');
    }
    return $u;
}

/** API: 회원 확인 후 세션 잠금 해제 (폴링이 다른 요청을 막지 않도록) */
function api_member(): array
{
    $u = require_member();
    $_SESSION['csrf'] = csrf_token();
    session_write_close();
    return $u;
}

function pending_count(): int
{
    return (int)q("SELECT COUNT(*) FROM in_members WHERE status = 'pending'")->fetchColumn();
}

// ---------------------------------------------------------------------
// 게시판 권한
// ---------------------------------------------------------------------
function board_by_slug(string $slug): ?array
{
    $b = q('SELECT * FROM in_boards WHERE slug = ?', [$slug])->fetch();
    return $b ?: null;
}

function board_by_id(int $id): ?array
{
    $b = q('SELECT * FROM in_boards WHERE id = ?', [$id])->fetch();
    return $b ?: null;
}

function can_view_board(array $board, array $user): bool
{
    return (bool)$board['is_visible'] || $user['is_admin'];
}

function can_write_board(array $board, array $user): bool
{
    return can_view_board($board, $user) && ($board['write_role'] === 'user' || $user['is_admin']);
}

function visible_boards(array $user): array
{
    $sql = 'SELECT * FROM in_boards' . ($user['is_admin'] ? '' : ' WHERE is_visible = 1') . ' ORDER BY sort_order, id';
    return q($sql)->fetchAll();
}

function not_found(string $msg = '페이지를 찾을 수 없습니다.'): never
{
    http_response_code(404);
    if (function_exists('page_header')) {
        page_header('없는 페이지', ['back' => url('')]);
        echo '<div class="empty"><p>' . e($msg) . '</p><a class="btn" href="' . e(url('')) . '">홈으로</a></div>';
        page_footer();
    } else {
        echo e($msg);
    }
    exit;
}

require __DIR__ . '/layout.php';
