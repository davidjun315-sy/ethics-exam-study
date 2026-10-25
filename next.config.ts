import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 공부용 데이터는 관리자가 수시로 수정하므로 모든 페이지를 요청 시점에 렌더링한다.
  // (Cache Components는 사용하지 않음)
  serverExternalPackages: [],
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
