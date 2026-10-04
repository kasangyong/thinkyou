import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { one, sql } from "./db";

const scryptAsync = promisify(scrypt) as (pw: string, salt: string, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "oneul_session";
const SESSION_DAYS = 7;

export type Role = "youth" | "mentor" | "counselor" | "backup" | "crisis_team";
export type Me = { id: string; role: Role; display_name: string; demo_set: number };

// ───────── 비밀번호 (scripts/seed.mjs와 같은 형식) ─────────
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ───────── 세션 쿠키: "사용자ID.만료시각.서명" ─────────
function sign(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET(32자 이상)이 필요합니다.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function startSession(userId: string) {
  const exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
  const payload = `${userId}.${exp}`;
  (await cookies()).set(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(exp),
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const [userId, exp, sig] = value.split(".");
  if (!userId || !exp || !sig) return null;
  const expected = Buffer.from(sign(`${userId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export const getMe = cache(async (): Promise<Me | null> => {
  const userId = readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return one<Me>(sql`select id, role, display_name, demo_set from profiles where id = ${userId}`);
});

export async function requireRole(roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me || !roles.includes(me.role)) throw new Error("권한이 없습니다.");
  return me;
}

// ───────── 접근 권한 (Supabase RLS를 대신한다) ─────────
// 대화: 청년 본인과 담당 선배만
export async function canUseThread(me: Me, youthId: string) {
  if (me.role === "youth") return me.id === youthId;
  if (me.role !== "mentor") return false;
  return !!(await one(sql`select 1 from assignments where youth_id = ${youthId} and mentor_id = ${me.id}`));
}
