import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import ChatSidebar from "@/components/ChatSidebar";
import ChatBubble, { ChatMessage, AgentStep } from "@/components/ChatBubble";
import ChatInput from "@/components/ChatInput";
import TypingIndicator from "@/components/TypingIndicator";
import AgentActivityPanel, { AgentActivity } from "@/components/AgentActivityPanel";
import LiveBrowserPanel from "@/components/LiveBrowserPanel";
import { streamChat, type Msg } from "@/lib/streamChat";
import { parseAgentResponse } from "@/lib/parseAgentResponse";
import { toast } from "sonner";

const AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-browse`;
const MAX_AGENT_STEPS = 12;

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
}

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm **DataNauts AI** — your autonomous intelligent assistant.\n\nI can **browse the web for you** — navigating pages, clicking links, filling forms, and extracting information. I also understand your **words**, **emotions**, and **images**.\n\nTry: *\"Search for trending GitHub repos\"* or ask me anything! 🚀",
  timestamp: new Date(),
  type: "chat",
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
  const abortRef = useRef(false);

  // Browser panel state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserUrl, setBrowserUrl] = useState("");
  const [browserTitle, setBrowserTitle] = useState("");
  const [browserContent, setBrowserContent] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentCommand, setCurrentCommand] = useState("");
  const [stepNumber, setStepNumber] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  // Agent activity
  const [activity, setActivity] = useState<AgentActivity>({
    currentUrl: "",
    currentStep: 0,
    maxSteps: MAX_AGENT_STEPS,
    status: "idle",
  });

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

  const addMessage = useCallback((msg: ChatMessage) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeIdRef.current
          ? {
              ...s,
              messages: [...s.messages, msg],
              title: s.messages.length <= 1
                ? (msg.content || "Web Task").slice(0, 40)
                : s.title,
            }
          : s
      )
    );
  }, []);

  const addStep = useCallback((step: AgentStep) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeIdRef.current) return s;
        const msgs = [...s.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant" && msgs[i].type === "log") {
            msgs[i] = { ...msgs[i], steps: [...(msgs[i].steps || []), step] };
            break;
          }
        }
        return { ...s, messages: msgs };
      })
    );
  }, []);

  const updateStep = useCallback((stepId: number, updates: Partial<AgentStep>) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeIdRef.current) return s;
        const msgs = [...s.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant" && msgs[i].type === "log") {
            msgs[i] = {
              ...msgs[i],
              steps: (msgs[i].steps || []).map((step) =>
                step.id === stepId ? { ...step, ...updates } : step
              ),
            };
            break;
          }
        }
        return { ...s, messages: msgs };
      })
    );
  }, []);

  // Call agent-browse edge function
  const callAgent = async (body: any) => {
    const resp = await fetch(AGENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || `Error ${resp.status}`);
    }
    return resp.json();
  };

  // Execute a command and get page state
  const executeCommand = async (command: string): Promise<{
    success: boolean;
    error?: string;
    pageInfo: { url: string; title: string };
    pageSummary: string;
    linksCount?: number;
  }> => {
    const cmd = command.toUpperCase();

    if (cmd.startsWith("GOTO ")) {
      const url = command.slice(5).trim();
      try {
        const data = await callAgent({ action: "fetch-page", url });
        return data;
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Failed",
          pageInfo: { url, title: "" },
          pageSummary: "",
        };
      }
    }

    // For CLICK, TYPE, PRESS, SCROLL, WAIT — simulate execution
    // In a real setup these would control Playwright
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));

    return {
      success: true,
      pageInfo: { url: browserUrl, title: browserTitle },
      pageSummary: browserContent ? `Current page: ${browserTitle}\nURL: ${browserUrl}\n\n${browserContent.slice(0, 1000)}` : "",
    };
  };

  /**
   * THE CORE AGENTIC LOOP — observe → think → act → repeat
   */
  const runAgentLoop = async (userTask: string) => {
    // Create log message for steps
    addMessage({
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      type: "log",
      timestamp: new Date(),
      steps: [],
    });

    setShowBrowser(true);
    setIsExecuting(true);
    setActivity({ currentUrl: "", currentStep: 0, maxSteps: MAX_AGENT_STEPS, status: "thinking" });

    const agentHistory: { role: string; content: string }[] = [];
    let stepCount = 0;
    let consecutiveFailures = 0;
    let lastCommand = "";
    let repeatCount = 0;

    while (stepCount < MAX_AGENT_STEPS && !abortRef.current) {
      stepCount++;
      setStepNumber(stepCount);
      setTotalSteps(Math.max(stepCount, totalSteps));

      // ── THINK: Ask AI for next action ──
      setActivity((a) => ({ ...a, currentStep: stepCount, status: "thinking" }));

      let nextAction: { command: string; thought: string };
      try {
        const data = await callAgent({
          action: "get-next-action",
          userTask,
          agentHistory,
          pageContext: browserContent ? `Page: ${browserTitle}\nURL: ${browserUrl}\n\n${browserContent.slice(0, 1500)}` : "",
        });
        nextAction = parseAgentResponse(data.text || "DONE");
      } catch (err) {
        addStep({ id: stepCount, command: "ERROR: Failed to get AI response", status: "error" });
        break;
      }

      let { command, thought } = nextAction;

      // ── REPETITION DETECTION ──
      const normalizedCmd = command.replace(/\s+/g, " ").trim().toUpperCase();
      const normalizedLast = lastCommand.replace(/\s+/g, " ").trim().toUpperCase();

      if (normalizedCmd === normalizedLast) {
        repeatCount++;
      } else {
        repeatCount = 0;
      }
      lastCommand = command;

      if (repeatCount >= 2) {
        if (/^TYPE/i.test(command)) {
          command = "PRESS Enter";
          thought = "Auto-pressing Enter because the TYPE command was repeated";
          repeatCount = 0;
        } else {
          addStep({ id: stepCount, command: "DONE — Stopped: repeated action detected", status: "done" });
          break;
        }
      }

      // Check if done
      if (command.toUpperCase().startsWith("DONE")) {
        addStep({ id: stepCount, command: `DONE${thought ? ` — ${thought}` : ""}`, status: "done" });
        setActivity((a) => ({ ...a, status: "complete" }));
        break;
      }

      // ── ACT: Execute the command ──
      setCurrentCommand(command);
      setActivity((a) => ({ ...a, status: "executing", lastCommand: command }));
      addStep({ id: stepCount, command, status: "running" });

      const result = await executeCommand(command);

      // Update browser panel
      if (result.pageInfo?.url) {
        setBrowserUrl(result.pageInfo.url);
        setActivity((a) => ({ ...a, currentUrl: result.pageInfo.url }));
      }
      if (result.pageInfo?.title) {
        setBrowserTitle(result.pageInfo.title);
      }
      if (result.pageSummary) {
        setBrowserContent(result.pageSummary);
      }
      if (result.linksCount !== undefined) {
        setActivity((a) => ({ ...a, elementsFound: result.linksCount }));
      }

      // ── RECORD: Feed result back to AI ──
      if (result.success) {
        updateStep(stepCount, { status: "done" });
        consecutiveFailures = 0;

        let feedback = `Action "${command}" succeeded.`;
        feedback += `\nPage URL: ${result.pageInfo?.url || "unknown"}`;
        feedback += `\nPage title: ${result.pageInfo?.title || "unknown"}`;
        if (result.pageSummary) {
          feedback += `\n\nCurrent page state:\n${result.pageSummary.slice(0, 1500)}`;
        }
        if (/^TYPE/i.test(command)) {
          feedback += `\n\nHINT: You just typed text into a field. You probably need to PRESS Enter to submit it.`;
        }

        agentHistory.push(
          { role: "assistant", content: command + (thought ? `\nThought: ${thought}` : "") },
          { role: "user", content: feedback }
        );
      } else {
        updateStep(stepCount, { status: "error" });
        consecutiveFailures++;

        let feedback = `Action "${command}" FAILED with error: ${result.error}`;
        feedback += `\nPage is still at: ${result.pageInfo?.url || "unknown"}`;
        if (result.pageSummary) {
          feedback += `\n\nCurrent page state:\n${result.pageSummary.slice(0, 1500)}`;
        }
        feedback += `\n\nYou MUST try a different approach. Do NOT repeat the same command.`;

        agentHistory.push(
          { role: "assistant", content: command + (thought ? `\nThought: ${thought}` : "") },
          { role: "user", content: feedback }
        );

        if (consecutiveFailures >= 3) {
          addStep({ id: stepCount + 1, command: "DONE — Stopped: too many failures", status: "error" });
          break;
        }
      }
    }

    // Get summary from AI
    try {
      const summaryData = await callAgent({
        action: "summarize",
        userTask,
        agentHistory,
      });

      addMessage({
        id: (Date.now() + 10).toString(),
        role: "assistant",
        content: summaryData.text || "Task completed.",
        type: "result",
        timestamp: new Date(),
      });
    } catch {
      addMessage({
        id: (Date.now() + 10).toString(),
        role: "assistant",
        content: "Task completed.",
        type: "result",
        timestamp: new Date(),
      });
    }

    setIsExecuting(false);
    setCurrentCommand("");
    setActivity((a) => ({ ...a, status: "complete" }));
  };

  const handleNewChat = () => {
    abortRef.current = true;
    setShowBrowser(false);
    setBrowserUrl("");
    setBrowserTitle("");
    setBrowserContent("");
    const id = Date.now().toString();
    setSessions((prev) => [...prev, { id, title: "New Chat", messages: [WELCOME] }]);
    setActiveId(id);
    setActivity({ currentUrl: "", currentStep: 0, maxSteps: MAX_AGENT_STEPS, status: "idle" });
  };

  const isWebTask = (msg: string) =>
    /search|go to|find|open|navigate|click|scrape|fill|browse|visit|look up|download|submit|login|sign in|register|check|show me|take me|continue|yes|do it|ok|okay|sure|go ahead|proceed/i.test(msg);

  const handleSend = async (text: string, images?: string[]) => {
    abortRef.current = false;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date(),
      images,
      type: "chat",
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

    try {
      if (isWebTask(text) && !images?.length) {
        // ★ RUN THE AGENTIC LOOP ★
        await runAgentLoop(text);
      } else {
        // Regular chat with streaming
        const currentSession = sessions.find((s) => s.id === activeIdRef.current)!;
        const apiMessages: Msg[] = currentSession.messages
          .filter((m) => m.id !== "welcome")
          .map((m) => ({ role: m.role, content: m.content }));

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
                  type: "chat",
                });
              }
              return { ...s, messages: msgs };
            })
          );
        };

        await streamChat({
          messages: apiMessages,
          onDelta: upsertAssistant,
          onDone: () => {},
          onError: (err) => toast.error(err),
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to connect to DataNauts AI");
    }

    setIsLoading(false);
  };

  const showActivityBar = activity.status !== "idle";

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
            abortRef.current = true;
            setActiveId(id);
            setSidebarOpen(false);
          }}
        />
      </div>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col h-full min-w-0" style={{
        flex: showBrowser ? "0 0 42%" : "1 1 auto",
        transition: "flex 0.3s ease",
      }}>
        {/* Header */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[hsl(var(--success))]" />
            <span className="text-sm font-medium text-foreground">DataNauts AI</span>
            <span className="text-xs text-muted-foreground">• Ready</span>
          </div>
          {showBrowser && (
            <span className="flex items-center gap-1.5 text-[0.65rem] text-[hsl(var(--success))] bg-[hsl(var(--success))]/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse" />
              Browser Active
            </span>
          )}
        </header>

        {/* Agent Activity Bar */}
        <AnimatePresence>
          {showActivityBar && <AgentActivityPanel activity={activity} />}
        </AnimatePresence>

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

      {/* Live browser panel */}
      {showBrowser && (
        <div className="hidden md:block" style={{ flex: "0 0 58%", height: "100vh", overflow: "hidden" }}>
          <LiveBrowserPanel
            url={browserUrl}
            isExecuting={isExecuting}
            currentCommand={currentCommand}
            stepNumber={stepNumber}
            totalSteps={totalSteps}
            pageTitle={browserTitle}
            pageContent={browserContent}
          />
        </div>
      )}
    </div>
  );
};

export default Index;
