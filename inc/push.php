<?php
defined('IN_APP') or exit;

/*
 * 웹 푸시 (외부 라이브러리 없이 동작)
 * - 알림 내용은 암호화해서 보내지 않고 "빈 푸시"만 보냅니다.
 * - 푸시를 받은 서비스 워커가 /api/push-latest.php 에서 최신 메시지를 가져와 알림을 띄웁니다.
 * - 필요한 PHP 확장: openssl, curl
 */

function b64u(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/** VAPID 키 (처음 호출 시 생성해서 DB에 저장). 서버가 지원하지 않으면 null */
function push_vapid(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    $cache = null;
    $json = setting_get('vapid');
    if ($json === null) {
        if (!function_exists('openssl_pkey_new')) {
            return null;
        }
        $key = @openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if (!$key || !openssl_pkey_export($key, $pem)) {
            return null;
        }
        $d = openssl_pkey_get_details($key);
        if (empty($d['ec']['x']) || empty($d['ec']['y'])) {
            return null;
        }
        $pub = "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
        // 동시에 두 번 생성되는 경우를 대비해 먼저 저장된 값을 사용
        q('INSERT IGNORE INTO in_settings (k, v) VALUES (?, ?)', ['vapid', json_encode(['pem' => $pem, 'public' => b64u($pub)])]);
        $json = setting_get('vapid');
    }
    $v = json_decode((string)$json, true);
    if (!is_array($v) || empty($v['pem']) || empty($v['public'])) {
        return null;
    }
    $cache = $v;
    return $cache;
}

/** openssl_sign 결과(DER)를 JWT용 64바이트 서명으로 변환 */
function push_der_to_raw(string $der): ?string
{
    if (strlen($der) < 8 || ord($der[0]) !== 0x30) {
        return null;
    }
    $o = 2;
    if (ord($der[1]) & 0x80) {
        $o += ord($der[1]) & 0x7f;
    }
    $parts = [];
    for ($i = 0; $i < 2; $i++) {
        if (ord($der[$o] ?? "\0") !== 0x02) {
            return null;
        }
        $len = ord($der[$o + 1]);
        $int = substr($der, $o + 2, $len);
        $o += 2 + $len;
        $int = ltrim($int, "\0");
        if (strlen($int) > 32) {
            return null;
        }
        $parts[] = str_pad($int, 32, "\0", STR_PAD_LEFT);
    }
    return $parts[0] . $parts[1];
}

function push_jwt(string $audience, array $vapid): ?string
{
    static $cache = [];
    if (isset($cache[$audience]) && $cache[$audience][1] > time() + 600) {
        return $cache[$audience][0];
    }
    $exp = time() + 12 * 3600;
    $h = b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $p = b64u(json_encode(['aud' => $audience, 'exp' => $exp, 'sub' => 'mailto:' . PUSH_CONTACT_EMAIL]));
    if (!openssl_sign("$h.$p", $der, $vapid['pem'], OPENSSL_ALGO_SHA256)) {
        return null;
    }
    $raw = push_der_to_raw($der);
    if ($raw === null) {
        return null;
    }
    $jwt = "$h.$p." . b64u($raw);
    $cache[$audience] = [$jwt, $exp];
    return $jwt;
}

/** 지정한 회원들의 모든 기기에 빈 푸시 발송. 만료된 구독은 삭제 */
function push_to_users(array $userIds): void
{
    $userIds = array_values(array_unique(array_map('intval', $userIds)));
    if (!$userIds || !function_exists('curl_multi_init')) {
        return;
    }
    $vapid = push_vapid();
    if (!$vapid) {
        return;
    }
    $subs = q('SELECT id, endpoint FROM in_push_subscriptions WHERE user_id IN (' . in_list($userIds) . ')', $userIds)->fetchAll();
    if (!$subs) {
        return;
    }

    $mh = curl_multi_init();
    $handles = [];
    foreach ($subs as $s) {
        $parts = parse_url($s['endpoint']);
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            continue;
        }
        $aud = 'https://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
        $jwt = push_jwt($aud, $vapid);
        if (!$jwt) {
            continue;
        }
        $ch = curl_init($s['endpoint']);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => '',
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_HTTPHEADER => [
                'TTL: 86400',
                'Urgency: high',
                'Authorization: vapid t=' . $jwt . ', k=' . $vapid['public'],
            ],
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[(int)$s['id']] = $ch;
    }

    do {
        $status = curl_multi_exec($mh, $running);
        if ($running) {
            curl_multi_select($mh, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    $expired = [];
    foreach ($handles as $sid => $ch) {
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($code === 404 || $code === 410) {
            $expired[] = $sid;
        }
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);

    if ($expired) {
        q('DELETE FROM in_push_subscriptions WHERE id IN (' . in_list($expired) . ')', $expired);
    }
}
