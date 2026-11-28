"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

// 糸口（糸の端）を探す虫めがね
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
      <path d="M8 10.5c1-1.6 2.6-1.6 3.6 0" />
    </svg>
  );
}

// 毛糸玉
function YarnIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="12" r="7" />
      <path d="M5.5 9.5c3-1.5 7-1 10.5 1.5" />
      <path d="M5 13.5c3.5-1.5 8-1 11.5 2" />
      <path d="M9 5.5c-1.5 3-1.5 9 0.5 13" />
      <path d="M17.5 15.5c1.5 1 2.5 2.5 2.5 4" />
    </svg>
  );
}

// 下部ナビの項目。機能を増やすときはここに追加する（#3）
const NAV_ITEMS: { href: string; label: string; icon: ReactNode; match: (p: string) => boolean }[] = [
  { href: "/", label: "糸口探し", icon: <SearchIcon />, match: (p) => p === "/" },
  { href: "/records", label: "記録", icon: <YarnIcon />, match: (p) => p.startsWith("/records") },
];

function NavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-navy/10 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-xl">
        {NAV_ITEMS.map((item) => {
          const active = pathname !== null && item.match(pathname);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-bold transition ${
                  active ? "text-leaf" : "text-navy/40 hover:text-navy/70"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.icon}
                {item.label}
                <span className={`h-1 w-6 rounded-full ${active ? "bg-sun" : "bg-transparent"}`} aria-hidden />
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
