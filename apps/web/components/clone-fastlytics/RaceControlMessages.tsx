"use client";

import { useEffect, useRef, useState } from "react";

import type { ReplayFrame, ReplayRaceControl } from "@/lib/clone-replay-api";

type DisplayMessage = ReplayRaceControl & { id: number; expiresAt: number };

let messageIdCounter = 0;

export function RaceControlMessages({ frame }: { frame: ReplayFrame | null }) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const lastFrameTime = useRef<number>(-1);

  useEffect(() => {
    if (!frame?.race_control || frame.timestamp === lastFrameTime.current) return;
    lastFrameTime.current = frame.timestamp;
    const now = Date.now();
    const newMsgs: DisplayMessage[] = frame.race_control.map((msg) => ({ ...msg, id: messageIdCounter++, expiresAt: now + 8000 }));
    if (newMsgs.length > 0) setMessages((prev) => [...prev, ...newMsgs].slice(-5));
  }, [frame]);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => prev.filter((m) => m.expiresAt > now));
    }, 1000);
    return () => clearInterval(timer);
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div className="flex max-w-[300px] flex-col gap-1.5">
      {messages.map((msg) => (
        <div key={msg.id} className="animate-in slide-in-from-right rounded-md border border-gray-600 bg-gray-900/90 px-3 py-2 text-xs text-gray-200 backdrop-blur-sm duration-300">
          {msg.flag ? <div className="mb-0.5 text-[9px] opacity-70">{msg.flag}</div> : null}
          <div className="leading-tight">{msg.message}</div>
        </div>
      ))}
    </div>
  );
}
