import Image from "next/image";
import Link from "next/link";

/** どの画面にも出す小さなロゴ */
export default function Header() {
  return (
    <header className="mb-6 flex items-center justify-center">
      <Link href="/" className="flex items-center gap-2" aria-label="ITOGUCHI トップへ">
        <Image src="/brand/icon.png" alt="" width={34} height={34} priority />
        <span className="text-xl font-black tracking-wider text-navy">ITOGUCHI</span>
      </Link>
    </header>
  );
}
