<?php
// 2.0부터 새 앱(index.php) 화면으로 옮겼어요. 예전 주소로 들어오면 새 화면으로 보내요.
require __DIR__ . '/inc/bootstrap.php';

require_login();
redirect(url('') . '#/' . 'cm/post/' . (int)($_GET['id'] ?? 0));
