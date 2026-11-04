# CONAS 사내 앱 (React Native)

웹의 `index.php` 한 페이지 앱(`assets/spa-*.js`)을 React Native(Expo)로 똑같이 옮긴 휴대폰 앱이에요.
서버 코드는 하나도 바꾸지 않았고, 웹이 쓰는 API(`api/app.php`, `api/messages.php` 등)를 그대로 불러요.

## 실행해 보기

```bash
cd app
npm install
npx expo start
```

휴대폰에 **Expo Go** 앱을 깔고, 터미널에 나온 QR 코드를 찍으면 바로 열려요. (Expo SDK 58)

## 서버 주소

`app.json` → `expo.extra.serverUrl` (기본값 `https://conas.kr/in`)

테스트 서버를 쓰려면 이 값만 바꾸면 돼요.

## 로그인 방식

웹과 같은 세션 쿠키 방식이에요.

1. `login.php`에서 보안 토큰(`_csrf`)을 읽고, 아이디와 비밀번호를 폼으로 보냄 ('로그인 유지' 켬)
2. 쿠키는 휴대폰 네트워크 기능이 알아서 저장하고 보냄
3. 변경 요청(POST)에는 `X-CSRF-Token` 헤더를 붙임. 토큰이 만료되면(419) 새 토큰으로 한 번 더 시도

## 화면 (웹 주소 → 앱)

| 웹 | 앱 | 파일 |
|---|---|---|
| `#/home` | 홈 (출근 QR 데모, 오늘 할 일, 공지, 이번 주 일정) | `src/views/Home.tsx` |
| `#/ws/task`, `#/ws/project/3` | 업무 · 프로젝트 · 검토(확정/반려) · 회사 마감 | `src/views/Task.tsx` |
| `#/ws/att` | 근태 (월간 달력 / 주간) | `src/views/Att.tsx` |
| `#/ws/doc` | 서류 · 결재 (작성, 승인/반려/취소, 첨부) | `src/views/Doc.tsx` |
| `#/ws/notice` | 공지 (필독 확인, 쓰기/수정/삭제) | `src/views/Notice.tsx` |
| `#/ws/me` | 내 정보 (프로필 사진, 계약서, 급여 명세, 화면 모드, 비밀번호) | `src/views/Me.tsx` |
| `#/cm/board`, `#/cm/post/5`, `#/cm/write/2` | 게시판 · 글 · 댓글/답글 · 글쓰기 | `src/views/Board.tsx` |
| `#/cm/chan`, `#/dm`, `#/chat/12` | 채널 · DM · 대화방 (읽음 숫자, 파일, 초대, 나가기) | `src/views/Chat.tsx` |
| `#/cm/people` | 임직원 (조직도, 대표 인사 변경, 팀 관리, 급여·계약서 입력) | `src/views/People.tsx` |
| `#/all`, `#/admin` | 전체 메뉴 · 관리자 (가입 승인, 게시판 설정) · 알림 | `src/views/All.tsx` |

- `src/app/` : 화면 이동 (Expo Router). 하단바가 있는 화면은 `index.tsx` 하나에서 바꿔 보여주고, 글 · 대화방 · 프로젝트 · 글쓰기 · 관리자는 위에 쌓이는 화면이에요.
- `src/ui/` : 공통 조각 (카드, 버튼, 아래에서 올라오는 창, 토스트, 확인 창 등). 모양은 `assets/spa.css`와 같아요.
- `src/lib/` : 서버 연결(`api.ts`), 앱 상태 · 화면 이동(`store.ts`), 색(`theme.ts`), 아이콘(`icons-data.ts`, 웹과 같은 모양)

## 웹과 다른 점

- **푸시 알림**: 웹은 브라우저 푸시(Web Push)라 앱에서는 쓸 수 없어요. 알림은 위쪽 종 아이콘에서 볼 수 있고, 숫자 배지는 20초마다 새로 받아요. 앱 푸시를 하려면 `expo-notifications`와 서버 쪽 작업이 따로 필요해요.
- **프로필 사진 자르기**: 웹의 자체 편집 화면 대신 휴대폰 기본 사진 편집(정사각형 자르기)을 써요.
- **사진 크게 보기**: 아이폰은 두 손가락으로 확대돼요. 안드로이드는 확대 없이 크게 보기만 돼요.
- **파일 받기**: 휴대폰의 열기/공유 창으로 넘겨줘요.
- **회원가입**: 웹의 가입 페이지(`register.php`)를 열어요.
- 앱 설치 안내, 새 버전 안내 띠는 웹 전용이라 뺐어요.

## 확인 명령

```bash
npm run typecheck   # 타입 검사
npm run lint        # 코드 검사
```
