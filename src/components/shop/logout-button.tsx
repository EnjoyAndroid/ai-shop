"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="inline-flex h-10 items-center text-base leading-6 text-gray-500 hover:text-red-500"
    >
      退出
    </button>
  );
}
