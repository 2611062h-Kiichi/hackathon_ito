import ReactMarkdown from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";

/** Gemini の解説（見出し・太字・箇条書きを含む）を読みやすく表示する */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 leading-relaxed">
      <ReactMarkdown
        // 「の**「下書き」**のように」のような日本語の太字も正しく扱う
        remarkPlugins={[remarkCjkFriendly]}
        components={{
          h1: ({ children }) => <h3 className="pt-1 text-lg font-black text-navy">{children}</h3>,
          h2: ({ children }) => <h3 className="pt-1 text-lg font-black text-navy">{children}</h3>,
          h3: ({ children }) => (
            <h3 className="flex items-center gap-2 pt-1 font-black text-navy">
              <span className="h-4 w-1 rounded-full bg-leaf" aria-hidden />
              {children}
            </h3>
          ),
          strong: ({ children }) => (
            <strong className="bg-[linear-gradient(transparent_60%,rgb(240_167_58/0.35)_60%)] font-bold text-navy">
              {children}
            </strong>
          ),
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          hr: () => <hr className="border-dashed border-navy/15" />,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-leaf underline">
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
