import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 로컬 점검용 PGlite(wasm)는 번들하지 않고 node_modules에서 그대로 불러온다
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
