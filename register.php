<?php
require __DIR__ . '/inc/bootstrap.php';

if (current_user()) {
    redirect('');
}

$errors = [];
$v = ['username' => '', 'email' => '', 'display_name' => ''];

if (is_post()) {
    check_csrf();
    $v['username'] = str_in($_POST, 'username', 60);
    $v['email'] = mb_strtolower(str_in($_POST, 'email', 120));
    $v['display_name'] = str_in($_POST, 'display_name', 60);
    $pw = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
    $pw2 = is_string($_POST['password2'] ?? null) ? $_POST['password2'] : '';

    if (mb_strlen($v['username']) < 2 || mb_strlen($v['username']) > 50 || preg_match('/[\s@<>"\'&]/u', $v['username'])) {
        $errors[] = '아이디는 2~50자로, 공백과 @ < > " \' & 는 쓸 수 없어요.';
    }
    if (!filter_var($v['email'], FILTER_VALIDATE_EMAIL) || mb_strlen($v['email']) > 100) {
        $errors[] = '올바른 이메일을 입력해 주세요.';
    }
    if ($v['display_name'] === '' || mb_strlen($v['display_name']) > 50) {
        $errors[] = '이름(표시 이름)을 1~50자로 입력해 주세요.';
    }
    if (strlen($pw) < 8) {
        $errors[] = '비밀번호는 8자 이상이어야 해요.';
    } elseif (strlen($pw) > 72) {
        $errors[] = '비밀번호는 72자 이하로 입력해 주세요.';
    } elseif ($pw !== $pw2) {
        $errors[] = '비밀번호 확인이 일치하지 않아요.';
    }

    if (!$errors) {
        $dup = q('SELECT username, email FROM users WHERE username = ? OR email = ?', [$v['username'], $v['email']])->fetchAll();
        foreach ($dup as $d) {
            if (mb_strtolower($d['username']) === mb_strtolower($v['username'])) $errors[] = '이미 사용 중인 아이디예요.';
            if (mb_strtolower($d['email']) === $v['email']) $errors[] = '이미 가입된 이메일이에요. conas.kr 계정이 있다면 로그인해 주세요.';
        }
        $errors = array_values(array_unique($errors));
    }

    if (!$errors) {
        $pdo = db();
        try {
            $pdo->beginTransaction();
            q('INSERT INTO users (username, password, email) VALUES (?, ?, ?)', [
                $v['username'],
                password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]),
                $v['email'],
            ]);
            $uid = (int)$pdo->lastInsertId();
            q("INSERT INTO in_members (user_id, display_name, status) VALUES (?, ?, 'pending')", [$uid, $v['display_name']]);
            $pdo->commit();
            login_user($uid, true);
            redirect('pending.php');
        } catch (PDOException $ex) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($ex->getCode() === '23000') {
                $errors[] = '이미 사용 중인 아이디 또는 이메일이에요.';
            } else {
                throw $ex;
            }
        }
    }
}

page_header('회원가입', ['body' => 'auth', 'tabbar' => false, 'back' => url('login.php')]);
?>
<div class="auth-box">
  <?php if ($errors): ?>
    <div class="flash flash-error" role="alert">
      <?php foreach ($errors as $er): ?><div><?= e($er) ?></div><?php endforeach; ?>
    </div>
  <?php endif; ?>

  <form method="post" class="form" data-once>
    <?= csrf_field() ?>
    <label class="field">
      <span>아이디</span>
      <input type="text" name="username" value="<?= e($v['username']) ?>" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" minlength="2" maxlength="50" required>
    </label>
    <label class="field">
      <span>이름 <small>(채팅과 게시판에 보이는 이름)</small></span>
      <input type="text" name="display_name" value="<?= e($v['display_name']) ?>" autocomplete="name" maxlength="50" required>
    </label>
    <label class="field">
      <span>이메일</span>
      <input type="email" name="email" value="<?= e($v['email']) ?>" autocomplete="email" autocapitalize="none" inputmode="email" maxlength="100" required>
    </label>
    <label class="field">
      <span>비밀번호 <small>(8자 이상)</small></span>
      <input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="72" required>
    </label>
    <label class="field">
      <span>비밀번호 확인</span>
      <input type="password" name="password2" autocomplete="new-password" minlength="8" maxlength="72" required>
    </label>
    <button class="btn btn-primary btn-block btn-shimmer" type="submit">가입 신청</button>
  </form>
  <p class="auth-note">가입하면 conas.kr 계정도 함께 만들어져요. 관리자가 승인하면 사내 플랫폼을 이용할 수 있어요.</p>
</div>
<?php
page_footer();
