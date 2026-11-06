<?php
defined('IN_APP') or exit;

/*
 * 모바일 사원증 바코드 (실제로 찍히는 코드)
 *  - 서버가 30초마다 그 사람의 코드를 새로 만들어 줌. 화면(브라우저)에서는 만들 수 없음
 *  - 코드: 16자리 숫자 = '88' + 회원 id 6자리 + 일회용 번호 8자리
 *      일회용 번호 = HMAC-SHA256(서버 비밀키, "회원id:30초 구간") 을 8자리 숫자로 (OTP와 같은 방식)
 *  - 바코드 형식: Code128 (일반 바코드 리더기 · 휴대폰 카메라로 읽힘)
 *  - 확인(reader.php): 지금 구간이나 바로 전 구간 코드면 통과 → 캡처한 화면은 길어야 1분 안에 무효
 *  - 서버 비밀키는 처음 쓸 때 만들어 in_settings('idcard_key')에 저장 (푸시 키와 같은 방식)
 */

const IDCARD_STEP = 30;          // 코드가 바뀌는 간격(초)
const IDCARD_PREFIX = '88';      // 사원증 코드 표시 (다른 바코드와 구분)
const IDCARD_HISTORY = 20;       // 이 구간 수 안의 예전 코드면 '만료'로 안내 (그보다 오래되면 '없는 코드')

function idcard_key(): string
{
    static $key = null;
    if ($key !== null) return $key;
    $v = setting_get('idcard_key');
    if ($v === null) {
        // 동시에 두 번 만들어지는 경우를 대비해 먼저 저장된 값을 씀
        q('INSERT IGNORE INTO in_settings (k, v) VALUES (?, ?)', ['idcard_key', bin2hex(random_bytes(32))]);
        $v = (string)setting_get('idcard_key');
    }
    return $key = (string)hex2bin($v);
}

/** 그 회원 · 그 구간의 일회용 번호 8자리 */
function idcard_otp(int $uid, int $win): string
{
    $mac = hash_hmac('sha256', $uid . ':' . $win, idcard_key(), true);
    $o = ord($mac[31]) & 0x0f;
    $n = ((ord($mac[$o]) & 0x7f) << 24) | (ord($mac[$o + 1]) << 16) | (ord($mac[$o + 2]) << 8) | ord($mac[$o + 3]);
    return str_pad((string)($n % 100000000), 8, '0', STR_PAD_LEFT);
}

function idcard_code(int $uid, int $win): string
{
    return IDCARD_PREFIX . str_pad((string)$uid, 6, '0', STR_PAD_LEFT) . idcard_otp($uid, $win);
}

/** 사원증 화면: 지금 코드 + 남은 초 (화면은 남은 초가 끝나면 다시 받아감) */
function api_idcard_code(array $me, array $in): array
{
    $now = time();
    $win = intdiv($now, IDCARD_STEP);
    return [
        'code' => idcard_code($me['id'], $win),
        'ttl' => IDCARD_STEP - ($now % IDCARD_STEP),
        'step' => IDCARD_STEP,
    ];
}

/** 리더기를 쓸 수 있는 사람: 대표 · 관리자 */
function can_read_idcard(array $me): bool
{
    return can_manage_company($me);
}

/** 리더기에 보여줄 사원 정보 */
function idcard_person(array $m): array
{
    return [
        'id' => $m['id'],
        'name' => $m['name'],
        'av' => avatar_url($m['id'], $m['avatar']),
        'team' => $m['role'] === 'ceo' ? 'CONAS' : ($m['team_name'] ?: '소속 없음'),
        'position' => $m['role'] === 'ceo' ? '대표이사' : (trim(($m['position'] ?? '') . ($m['role'] === 'lead' ? ' · 팀장' : ''), ' ·') ?: ROLE_LABEL[$m['role']]),
        'employee_no' => $m['employee_no'],
    ];
}

/**
 * 리더기: 코드 확인 + 기록
 *  result: ok(통과) · expired(예전 코드, 캡처 의심) · invalid(없는 코드) · inactive(이용 중지된 사람)
 */
function api_idcard_verify(array $me, array $in): array
{
    if (!can_read_idcard($me)) fail('대표나 관리자만 사원증을 확인할 수 있어요.', 403);
    $code = preg_replace('/\D/', '', (string)($in['code'] ?? '')) ?? '';
    $now = time();
    $win = intdiv($now, IDCARD_STEP);
    $result = 'invalid';
    $uid = null;
    $person = null;
    if (preg_match('/^' . IDCARD_PREFIX . '(\d{6})(\d{8})$/', $code, $mm)) {
        $uid = (int)$mm[1];
        $m = org_member($uid);   // 승인된(사용 중) 직원만 들어 있음
        if (!$m) {
            $exists = $uid > 0 && q('SELECT 1 FROM in_members WHERE user_id = ?', [$uid])->fetchColumn();
            $result = $exists ? 'inactive' : 'invalid';
            if (!$exists) $uid = null;
        } else {
            $person = idcard_person($m);
            // 지금 구간 · 바로 전 구간이면 통과 (화면이 바뀌는 순간 찍은 경우)
            if (hash_equals(idcard_otp($uid, $win), $mm[2]) || hash_equals(idcard_otp($uid, $win - 1), $mm[2])) {
                $result = 'ok';
            } else {
                for ($w = $win - 2; $w >= $win - IDCARD_HISTORY; $w--) {
                    if (hash_equals(idcard_otp($uid, $w), $mm[2])) {
                        $result = 'expired';
                        break;
                    }
                }
                if ($result !== 'expired') {
                    $result = 'invalid';
                    $person = null;
                    $uid = null;
                }
            }
        }
    }
    q('INSERT INTO in_idcard_scans (user_id, scanned_by, result) VALUES (?, ?, ?)', [$uid, $me['id'], $result]);
    return ['result' => $result, 'person' => $person, 'ts' => $now, 'recent' => idcard_recent()];
}

/** 최근 확인 기록 */
function idcard_recent(int $limit = 30): array
{
    $rows = q(
        'SELECT s.user_id, s.result, UNIX_TIMESTAMP(s.created_at) AS ts FROM in_idcard_scans s ORDER BY s.id DESC LIMIT ' . (int)$limit
    )->fetchAll();
    return array_map(fn($r) => [
        'name' => $r['user_id'] !== null ? org_name((int)$r['user_id']) : null,
        'result' => $r['result'],
        'ts' => (int)$r['ts'],
    ], $rows);
}

function api_idcard_scans(array $me, array $in): array
{
    if (!can_read_idcard($me)) fail('대표나 관리자만 볼 수 있어요.', 403);
    return ['recent' => idcard_recent()];
}
