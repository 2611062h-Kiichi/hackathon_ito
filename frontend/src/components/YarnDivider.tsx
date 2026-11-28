/** 毛糸の糸のような区切り線 */
export default function YarnDivider({ color = "var(--color-yarn)" }: { color?: string }) {
  return (
    <svg viewBox="0 0 320 16" className="my-2 h-4 w-full" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 8 Q 20 0 40 8 T 80 8 T 120 8 T 160 8 T 200 8 T 240 8 T 280 8 T 320 8"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
