import "server-only";
import { neon } from "@neondatabase/serverless";

// Neon HTTP 드라이버. 템플릿 리터럴의 ${값}은 매개변수로 전달돼 SQL 인젝션에 안전하다.
export const sql = neon(process.env.DATABASE_URL!);

export async function rows<T>(query: Promise<unknown>): Promise<T[]> {
  return (await query) as T[];
}

export async function one<T>(query: Promise<unknown>): Promise<T | null> {
  return ((await query) as T[])[0] ?? null;
}
