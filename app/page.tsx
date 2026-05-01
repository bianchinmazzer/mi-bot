"use client";

import React, { useState, useRef, useEffect, FormEvent } from "react";
import ReactMarkdown from "react-markdown";

type DisplayMessage = { role: "user" | "assistant"; text: string };
type Stats = { totalInputTokens: number; totalOutputTokens: number };

const markdownComponents = {
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", {
      ...props,
      target: "_blank",
      rel: "noopener noreferrer",
    }),
};

export default function Home() {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: "assistant",
      text: "Hi, I'm Matias's digital twin. Ask me about my experience, my projects, or schedule a meeting with me.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverHistory, setServerHistory] = useState<unknown[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalInputTokens: 0,
    totalOutputTokens: 0,
  });
  const [ended, setEnded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading || ended) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: serverHistory, stats }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.error ?? "Something went wrong." },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.reply },
        ]);
        setServerHistory(data.history);
        if (data.stats) setStats(data.stats);
        if (data.ended) setEnded(true);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Network error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col w-full bg-zinc-950 text-zinc-100" style={{ height: "100dvh", maxWidth: "100vw" }}>
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Matias Bianchin Mazzer</h1>
        <p className="text-xs text-zinc-400">
          Frontend Engineer & AI Developer · Digital twin
        </p>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`rounded-2xl px-4 py-2 max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-a:text-blue-400 prose-a:underline">
                    <ReactMarkdown components={markdownComponents}>
                      {m.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  m.text
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-2 bg-zinc-800 text-zinc-400 text-sm">
                Thinking...
              </div>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-800 px-4 py-4 bg-zinc-950 w-full"
      >
        <div className="max-w-2xl mx-auto flex gap-2 w-full overflow-hidden">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              ended
                ? "Conversation ended — refresh to start over"
                : "Ask about my experience..."
            }
            disabled={loading || ended}
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-zinc-600 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || ended}
            className="flex-none bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-4 py-2 text-sm font-medium"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
