"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

// 下部ナビの項目。機能を増やすときはここに追加する（#3）
const NAV_ITEMS = [
  { href: "/", label: "糸口探し", icon: "🔍", match: (p: string) => p === "/" },
  { href: "/mindmap", label: "ことばマップ", icon: "🧵", match: (p: string) => p.startsWith("/mindmap") },
  { href: "/records", label: "記録", icon: "🧶", match: (p: string) => p.startsWith("/records") },
];

function NavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-2xl">
        {NAV_ITEMS.map((item) => {
          const active = pathname !== null && item.match(pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center py-2 text-xs font-bold ${
                  active ? "text-leaf" : "text-navy/50"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className="text-xl" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ActiveNavBar() {
  return <NavBar pathname={usePathname()} />;
}

export default function BottomNav() {
  // URL は実行時にしかわからないため、事前レンダリング時は選択状態なしで表示する
  return (
    <Suspense fallback={<NavBar pathname={null} />}>
      <ActiveNavBar />
    </Suspense>
  );
}
