"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn"
      onClick={async () => {
        await fetch("/api/admin/login", { method: "DELETE" });
        router.push("/");
        router.refresh();
      }}
    >
      로그아웃
    </button>
  );
}
