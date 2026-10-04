"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 실시간 구독 대신 일정 간격으로 화면 데이터를 다시 불러온다(MVP).
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
