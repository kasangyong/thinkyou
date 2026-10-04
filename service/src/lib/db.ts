import "server-only";
import { neon } from "@neondatabase/serverless";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

// 로컬 점검용: LOCAL_PGLITE=1 이면 메모리 안의 Postgres(PGlite)를 쓴다. 서버를 끄면 데이터가 사라진다.
// 운영(Vercel)에서는 쓰지 않는다. scripts/dev-local.mjs 참고.
type PgliteLike = { query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
const g = globalThis as unknown as { __pglite?: Promise<PgliteLike> };

async function localDb(): Promise<PgliteLike> {
  g.__pglite ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { readFile } = await import("node:fs/promises");
    const db = new PGlite();
    await db.exec(await readFile(`${process.cwd()}/db/schema.sql`, "utf8"));
    return db as unknown as PgliteLike;
  })();
  return g.__pglite;
}

const localSql: Sql = async (strings, ...values) => {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
  return (await (await localDb()).query(text, values)).rows;
};

// Neon HTTP 드라이버. 템플릿 리터럴의 ${값}은 매개변수로 전달돼 SQL 인젝션에 안전하다.
export const sql: Sql = process.env.LOCAL_PGLITE === "1" ? localSql : neon(process.env.DATABASE_URL!);

export async function rows<T>(query: Promise<unknown>): Promise<T[]> {
  return (await query) as T[];
}

export async function one<T>(query: Promise<unknown>): Promise<T | null> {
  return ((await query) as T[])[0] ?? null;
}
