"use client";

import CodeEditor from "@uiw/react-textarea-code-editor";
import { useEffect, useRef, useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("execCommand copy failed");
  }
}

export function CodeBlock({ code, language = "ts" }: CodeBlockProps) {
  const resetTimerRef = useRef<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function onCopy(): Promise<void> {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    try {
      await copyToClipboard(code);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    resetTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2000);
  }

  const copyLabel =
    copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy";

  return (
    <div className="relative border border-neutral-800 bg-neutral-900 pr-20">
      <button
        type="button"
        onClick={onCopy}
        className="absolute top-3 right-3 z-10 border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-sky-500/40 hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        aria-label={`${copyLabel} code sample`}
      >
        {copyLabel}
      </button>
      <CodeEditor
        value={code}
        language={language}
        padding={16}
        disabled
        style={{
          backgroundColor: "transparent",
          fontSize: 14,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        }}
      />
    </div>
  );
}
