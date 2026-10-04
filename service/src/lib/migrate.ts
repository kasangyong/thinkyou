import "server-only";
import { sql } from "./db";

// 배포 후 스키마를 다시 실행하지 않아도 되도록, 작은 컬럼 추가는 앱이 처음 요청을 받을 때 적용한다.
// 모두 여러 번 실행해도 안전한 문장만 둔다. 같은 내용이 db/schema.sql에도 있다.
let done: Promise<void> | null = null;

export function ensureMigrations() {
  done ??= (async () => {
    await sql`alter table daily_steps add column if not exists feedback text`;
  })().catch((e) => {
    done = null;
    throw e;
  });
  return done;
}
