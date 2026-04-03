import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import ChatSidebar from "@/components/ChatSidebar";
import ChatBubble, { ChatMessage } from "@/components/ChatBubble";
import ChatInput from "@/components/ChatInput";
import TypingIndicator from "@/components/TypingIndicator";
import { streamChat, type Msg } from "@/lib/streamChat";
import { toast } from "sonner";

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm **DataNauts AI** — your intelligent assistant.\n\nI understand your **words**, **emotions**, and **images**. Whether you need help brainstorming, coding, writing, analyzing photos, or just want to chat — I'm here for you.\n\nTry sending me an image or asking me anything! 🚀",
  timestamp: new Date(),
};

const Index = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: "1", title: "New Chat", messages: [WELCOME] },
  ]);
  const [activeId, setActiveId] = useState("1");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef(activeId);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const activeSession = sessions.find((s) => s.id === activeId)!;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeSession.messages, scrollToBottom]);

  const handleNewChat = () => {
    const id = Date.now().toString();
    setSessions((prev) => [...prev, { id, title: "New Chat", messages: [WELCOME] }]);
    setActiveId(id);
  };

  const handleSend = async (text: string, images?: string[]) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
      images,
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeIdRef.current
          ? {
              ...s,
              messages: [...s.messages, userMsg],
              title: s.messages.length <= 1 ? (text || "Image Chat").slice(0, 40) : s.title,
            }
          : s
      )
    );

    setIsLoading(true);

    // Build messages for the API
    const currentSession = sessions.find((s) => s.id === activeIdRef.current)!;
    const apiMessages: Msg[] = currentSession.messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    // Build user message content (text + optional images)
    let userContent: string | any[];
    if (images && images.length > 0) {
      userContent = [
        { type: "text", text: text || "What do you see in this image?" },
        ...images.map((img) => ({
          type: "image_url",
          image_url: { url: img },
        })),
      ];
    } else {
      userContent = text;
    }
    apiMessages.push({ role: "user", content: userContent });

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      const content = assistantSoFar;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeIdRef.current) return s;
          const msgs = [...s.messages];
          const last = msgs[msgs.length - 1];
          if (last?.role === "assistant" && last.id.startsWith("stream-")) {
            msgs[msgs.length - 1] = { ...last, content };
          } else {
            msgs.push({
              id: "stream-" + Date.now(),
              role: "assistant",
              content,
              timestamp: new Date(),
            });
          }
          return { ...s, messages: msgs };
        })
      );
    };

    try {
      await streamChat({
        messages: apiMessages,
        onDelta: upsertAssistant,
        onDone: () => setIsLoading(false),
        onError: (err) => {
          toast.error(err);
          setIsLoading(false);
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to connect to DataNauts AI");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 md:hidden w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground"
      >
        ☰
      </button>

      {/* Sidebar */}
      <div className={`${sidebarOpen ? "block" : "hidden"} md:block`}>
        <ChatSidebar
          sessions={sessions.map((s) => ({ id: s.id, title: s.title }))}
          activeId={activeId}
          onNewChat={handleNewChat}
          onSelect={(id) => {
            setActiveId(id);
            setSidebarOpen(false);
          }}
        />
      </div>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center px-6 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--success))]" />
            <span className="text-sm font-medium text-foreground">DataNauts AI</span>
            <span className="text-xs text-muted-foreground">• Ready</span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-4">
          <AnimatePresence>
            {activeSession.messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>
          {isLoading && !activeSession.messages.some((m) => m.id.startsWith("stream-")) && (
            <TypingIndicator />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </main>
    </div>
  );
};

export default Index;
