"use client";

import { useEffect, useRef } from "react";

// 대화를 열거나 새 글이 생기면 가장 최근 글로 내려 준다. 위로 읽는 중에 10초 새로고침으로 튀지 않도록 개수가 바뀔 때만 움직인다.
export function ScrollToEnd({ count }: { count: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [count]);
  // 하단 입력창·안전 안내에 가려지지 않도록 그 높이만큼 여유를 둔다
  return <span ref={ref} aria-hidden="true" className="block scroll-mb-44" />;
}
