// 로컬 점검용 개발 서버: 운영 DB 대신 메모리 Postgres(PGlite)로 띄운다.
// 실행: npm run dev:local  →  http://localhost:3100
// 아래 값은 이 로컬 점검에서만 쓰는 테스트 값이다. 운영 환경변수와 무관하다.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = {
  ...process.env,
  LOCAL_PGLITE: "1",
  SESSION_SECRET: randomBytes(32).toString("hex"),
  DEMO_PASSWORD: "local-test-1234",
  INVITE_CODE: "local-invite",
  CRON_SECRET: "local-cron",
  // GEMINI_API_KEY 가 없으면 오늘의 한 걸음은 기본 문장으로 대체된다
};

spawn("npx", ["next", "dev", "-p", "3100"], { env, stdio: "inherit", shell: true });
