# 내 소개 페이지와 패스키 공간 · T08

T01 공개 소개 페이지 `https://yxh750501-sys.github.io/SKT_ALEPH/`의 HTML·CSS·이미지를 그대로 가져와 공개 영역에 두고, 아래에 WebAuthn 패스키로 잠긴 메모 공간을 추가했습니다. 기존 T01 기준 소스는 `yxh750501-sys/SKT_ALEPH`의 `8eb40817b042dbe87efc44468d6ddf667fd061c8`입니다.

패스키 서버는 `worker/index.js`, 브라우저 코드는 `passkey.js`, DB 스키마는 `drizzle/0000_passkeys.sql`입니다. 비공개 메모 세 건은 가상 자료입니다. 가입·로그인·로그아웃·개인 메모 조회는 `/api/register/*`, `/api/login/*`, `/api/logout`, `/api/private`를 거칩니다. 비밀번호 입력이나 저장은 없습니다.

로컬 확인: `npm ci`, `npm run build`, `T08_PREVIEW_PORT=4189 node scripts/preview.mjs`, 별도 터미널에서 `node tests/browser.mjs`. 테스트는 Chromium 가상 인증기를 사용하며 실제 기기의 패스키 저장 위치를 증명하지 않습니다.
