"use client";

import { useEffect, useState } from "react";

type Props = {
  /** 待っている間に順に表示するメッセージ */
  messages: string[];
  /** 毛糸の色（編み物の種類に合わせる） */
  color?: string;
};

const ROWS = 5;
const STITCHES = 6;

/** AIの応答を待つ間に表示する、毛糸が編まれていくアニメーション */
export default function KnittingLoader({ messages, color = "var(--color-yarn)" }: Props) {
  const [index, setIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const msg = setInterval(() => setIndex((i) => (i + 1) % messages.length), 2600);
    const clock = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      clearInterval(msg);
      clearInterval(clock);
    };
  }, [messages.length]);

  return (
    <div
      className="flex flex-col items-center rounded-3xl bg-paper px-4 py-6 shadow-soft"
      role="status"
      aria-live="polite"
    >
      <svg viewBox="0 0 220 130" className="h-32 w-56" aria-hidden>
        {/* 毛糸玉 */}
        <g className="knit-ball">
          <circle cx="52" cy="86" r="28" fill={color} />
          <g fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M30 74 Q52 60 74 76" />
            <path d="M27 88 Q52 72 78 90" />
            <path d="M32 101 Q55 86 76 104" />
            <path d="M44 60 Q36 86 48 112" />
          </g>
        </g>
        {/* 糸 */}
        <path
          className="knit-thread"
          d="M76 92 C 98 108, 108 70, 122 58"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* 編み地：1段ずつ現れる */}
        {Array.from({ length: ROWS }, (_, r) => (
          <g
            key={r}
            className="knit-row"
            style={{ animationDelay: `${r * 0.7}s` }}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {Array.from({ length: STITCHES }, (_, s) => {
              const x = 122 + s * 12;
              const y = 46 + r * 11;
              return <path key={s} d={`M${x} ${y} L${x + 5} ${y + 8} L${x + 10} ${y}`} />;
            })}
          </g>
        ))}
        {/* 編み棒 */}
        <g strokeLinecap="round">
          <g className="knit-needle-l">
            <line x1="104" y1="22" x2="160" y2="44" stroke="#c9a46a" strokeWidth="4" />
            <circle cx="104" cy="22" r="5" fill="#e8cf9c" />
          </g>
          <g className="knit-needle-r">
            <line x1="148" y1="44" x2="204" y2="22" stroke="#c9a46a" strokeWidth="4" />
            <circle cx="204" cy="22" r="5" fill="#e8cf9c" />
          </g>
        </g>
      </svg>

      <p
        key={index}
        className="mt-3 flex min-h-14 animate-fade-up items-center text-center font-bold text-balance text-navy"
      >
        {messages[index]}
      </p>
      <p className="mt-1 text-xs text-navy/50">{seconds}秒 ・ ひと目ずつ編んでいます</p>
    </div>
  );
}
