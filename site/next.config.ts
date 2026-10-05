import type { NextConfig } from "next";

// 정적 사이트로 빌드한다 (서버·DB 없이 어떤 정적 호스팅에도 올릴 수 있음).
// URL은 site-ia.md §14 규칙에 맞춰 끝에 "/"를 붙인다 (/tasks/, /a/{slug}/).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
