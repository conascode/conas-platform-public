<?php
require __DIR__ . '/inc/bootstrap.php';

$next = safe_next($_GET['next'] ?? $_POST['next'] ?? '');
if (current_user()) {
    redirect($next);
}

$error = '';
$login = '';

if (is_post()) {
    check_csrf();
    $login = str_in($_POST, 'login', 100);
    $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
    $remember = !empty($_POST['remember']);

    // 최근 10분 동안 같은 IP 10회, 같은 아이디 5회 실패하면 잠시 막음
    q('DELETE FROM in_login_attempts WHERE attempted_at < NOW() - INTERVAL 1 DAY');
    $ipFails = (int)q('SELECT COUNT(*) FROM in_login_attempts WHERE ip = ? AND attempted_at > NOW() - INTERVAL 10 MINUTE', [client_ip()])->fetchColumn();
    $idFails = (int)q('SELECT COUNT(*) FROM in_login_attempts WHERE login = ? AND attempted_at > NOW() - INTERVAL 10 MINUTE', [mb_strtolower($login)])->fetchColumn();

    if ($ipFails >= 10 || $idFails >= 5) {
        $error = '로그인 시도가 너무 많습니다. 10분 후 다시 시도해 주세요.';
    } elseif ($login === '' || $password === '') {
        $error = '아이디와 비밀번호를 입력해 주세요.';
    } else {
        $user = q('SELECT id, password FROM users WHERE username = ? OR email = ? LIMIT 1', [$login, $login])->fetch();
        if ($user && password_verify($password, $user['password'])) {
            q('DELETE FROM in_login_attempts WHERE login = ?', [mb_strtolower($login)]);
            // 메인 사이트 회원이 처음 들어오면 사내 이용 신청(승인 대기)으로 등록
            q("INSERT IGNORE INTO in_members (user_id, status) VALUES (?, 'pending')", [(int)$user['id']]);
            $status = (string)q('SELECT status FROM in_members WHERE user_id = ?', [(int)$user['id']])->fetchColumn();
            if ($status === 'disabled') {
                $error = '이용이 중지된 계정입니다. 관리자에게 문의해 주세요.';
            } else {
                login_user((int)$user['id'], $remember);
                redirect($status === 'active' ? $next : url('pending.php'));
            }
        } else {
            q('INSERT INTO in_login_attempts (ip, login) VALUES (?, ?)', [client_ip(), mb_strtolower($login)]);
            $error = '아이디 또는 비밀번호가 맞지 않습니다.';
        }
    }
}

page_header('로그인', ['body' => 'auth', 'tabbar' => false]);
?>
<div class="auth-box">
  <div class="auth-logo">
    <img src="<?= e(url('assets/icons/icon-192.png')) ?>" alt="" width="64" height="64">
    <div class="auth-name"><?= e(APP_NAME) ?></div>
  </div>

  <?php if ($error): ?>
    <div class="flash flash-error" role="alert"><?= e($error) ?></div>
  <?php endif; ?>

  <div class="beam-card">
  <form method="post" class="form" data-once>
    <?= csrf_field() ?>
    <input type="hidden" name="next" value="<?= e($next) ?>">
    <label class="field">
      <span>아이디 또는 이메일</span>
      <input type="text" name="login" value="<?= e($login) ?>" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required>
    </label>
    <label class="field">
      <span>비밀번호</span>
      <input type="password" name="password" autocomplete="current-password" required>
    </label>
    <label class="check">
      <input type="checkbox" name="remember" value="1" checked>
      <span>로그인 유지</span>
    </label>
    <button class="btn btn-primary btn-block btn-shimmer" type="submit">로그인</button>
  </form>
  </div>

  <p class="auth-alt">계정이 없나요? <a href="<?= e(url('register.php')) ?>">회원가입</a></p>
  <p class="auth-note">conas.kr 계정으로도 로그인할 수 있어요. 처음 로그인하면 관리자 승인 후 이용할 수 있어요.</p>
</div>
<?php
page_footer();
