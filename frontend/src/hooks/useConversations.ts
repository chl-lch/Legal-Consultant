import { useCallback, useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────
export type ConvMessage = {
  role: "user" | "assistant";
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response?: any;
  streaming?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  streamPhase?: any;
  feedback?: "up" | "down";
};

export type Conversation = {
  id: string;
  title: string;
  messages: ConvMessage[];
  createdAt: string;
  updatedAt: string;
};

// ── Storage keys ─────────────────────────────────────────────
const INDEX_KEY = "lc_conv_index";
const CONV_KEY = (id: string) => `lc_conv_${id}`;
const ACTIVE_KEY = "lc_conv_active";
const LEGACY_KEY = "lc_chat_history";

// ── Helpers ───────────────────────────────────────────────────
function loadIndex(): Array<{ id: string; title: string; updatedAt: string }> {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function loadConv(id: string): ConvMessage[] {
  try {
    return JSON.parse(localStorage.getItem(CONV_KEY(id)) ?? "[]");
  } catch {
    return [];
  }
}

function saveConv(id: string, messages: ConvMessage[]): void {
  localStorage.setItem(CONV_KEY(id), JSON.stringify(messages.filter((m) => !m.streaming)));
}

function saveIndex(index: Array<{ id: string; title: string; updatedAt: string }>): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function titleFromMessages(messages: ConvMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  const text = first.content.slice(0, 50);
  return text.length < first.content.length ? text + "…" : text;
}

function migrateLegacy(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const messages: ConvMessage[] = JSON.parse(raw);
    if (!messages.length) return null;
    const id = newId();
    const title = titleFromMessages(messages);
    const ts = new Date().toISOString();
    saveConv(id, messages);
    const index = loadIndex();
    index.unshift({ id, title, updatedAt: ts });
    saveIndex(index);
    localStorage.removeItem(LEGACY_KEY);
    return id;
  } catch {
    return null;
  }
}

// ── Hook ──────────────────────────────────────────────────────
export function useConversations() {
  const [index, setIndex] = useState<Array<{ id: string; title: string; updatedAt: string }>>(() => {
    const idx = loadIndex();
    if (!idx.length) {
      // Try to migrate legacy history first
      const migrated = migrateLegacy();
      if (migrated) return loadIndex();
    }
    return idx;
  });

  const [activeId, setActiveId] = useState<string>(() => {
    const stored = localStorage.getItem(ACTIVE_KEY);
    if (stored && loadIndex().some((c) => c.id === stored)) return stored;
    const idx = loadIndex();
    return idx[0]?.id ?? "";
  });

  const [messages, setMessages] = useState<ConvMessage[]>(() =>
    activeId ? loadConv(activeId) : [],
  );

  // Sync active conversation to localStorage
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  // Persist messages whenever they change
  useEffect(() => {
    if (activeId) saveConv(activeId, messages);
    if (activeId && messages.length > 0) {
      setIndex((prev) => {
        const title = titleFromMessages(messages);
        const ts = new Date().toISOString();
        const updated = prev.map((c) =>
          c.id === activeId ? { ...c, title, updatedAt: ts } : c,
        );
        saveIndex(updated);
        return updated;
      });
    }
  }, [messages, activeId]);

  const newConversation = useCallback(() => {
    const id = newId();
    const ts = new Date().toISOString();
    const entry = { id, title: "New conversation", updatedAt: ts };
    setIndex((prev) => {
      const next = [entry, ...prev];
      saveIndex(next);
      return next;
    });
    setActiveId(id);
    setMessages([]);
  }, []);

  const switchConversation = useCallback((id: string) => {
    setActiveId(id);
    setMessages(loadConv(id));
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      localStorage.removeItem(CONV_KEY(id));
      setIndex((prev) => {
        const next = prev.filter((c) => c.id !== id);
        saveIndex(next);
        return next;
      });
      if (id === activeId) {
        const remaining = loadIndex().filter((c) => c.id !== id);
        if (remaining.length) {
          setActiveId(remaining[0].id);
          setMessages(loadConv(remaining[0].id));
        } else {
          // Create a fresh conversation
          const newConvId = newId();
          const ts = new Date().toISOString();
          const entry = { id: newConvId, title: "New conversation", updatedAt: ts };
          saveIndex([entry]);
          setIndex([entry]);
          setActiveId(newConvId);
          setMessages([]);
        }
      }
    },
    [activeId],
  );

  const clearActive = useCallback(() => {
    setMessages([]);
    if (activeId) {
      localStorage.removeItem(CONV_KEY(activeId));
      setIndex((prev) => {
        const updated = prev.map((c) =>
          c.id === activeId ? { ...c, title: "New conversation" } : c,
        );
        saveIndex(updated);
        return updated;
      });
    }
  }, [activeId]);

  return {
    index,
    activeId,
    messages,
    setMessages,
    newConversation,
    switchConversation,
    deleteConversation,
    clearActive,
    activeTitle: index.find((c) => c.id === activeId)?.title ?? "New conversation",
  };
}
