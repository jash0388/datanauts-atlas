import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { User, Rocket, CheckCircle2, Loader2, XCircle } from "lucide-react";

export interface AgentStep {
  id: number;
  command: string;
  status: "running" | "done" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  images?: string[];
  type?: "chat" | "log" | "result" | "error";
  steps?: AgentStep[];
}

const StepIcon = ({ status }: { status: AgentStep["status"] }) => {
  switch (status) {
    case "running":
      return <Loader2 size={12} className="text-[hsl(var(--warning))] animate-spin" />;
    case "done":
      return <CheckCircle2 size={12} className="text-[hsl(var(--success))]" />;
    case "error":
      return <XCircle size={12} className="text-destructive" />;
  }
};

const ChatBubble = ({ message }: { message: ChatMessage }) => {
  const isUser = message.role === "user";

  // Don't render empty log messages with no steps
  if (message.type === "log" && (!message.steps || message.steps.length === 0) && !message.content) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isUser ? "bg-secondary" : "gradient-accent"
        }`}
      >
        {isUser ? (
          <User size={16} className="text-muted-foreground" />
        ) : (
          <Rocket size={16} className="text-primary-foreground" />
        )}
      </div>

      {/* Content */}
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground rounded-tr-md"
            : "glass border border-border rounded-tl-md"
        }`}
      >
        {message.type === "error" && (
          <span className="text-destructive text-xs font-mono mb-1 block">ERROR</span>
        )}
        {message.type === "result" && (
          <span className="text-[hsl(var(--success))] text-xs font-mono mb-1 block">✨ COMPLETE</span>
        )}

        {/* Agent execution steps */}
        {message.steps && message.steps.length > 0 && (
          <div className="space-y-1.5 mb-2">
            <span className="text-[0.65rem] text-muted-foreground font-medium uppercase tracking-wider">
              Agent Actions
            </span>
            {message.steps.map((step) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2 text-xs font-mono"
              >
                <StepIcon status={step.status} />
                <span className={step.status === "running" ? "text-foreground" : "text-muted-foreground"}>
                  {step.command}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Show attached images */}
        {message.images && message.images.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {message.images.map((img, i) => (
              <img
                key={i}
                src={img}
                alt="Attached"
                className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-border"
              />
            ))}
          </div>
        )}

        {/* Content */}
        {message.content && (
          isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )
        )}

        <p className="text-[0.6rem] mt-2 opacity-40">
          {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </motion.div>
  );
};

export default ChatBubble;
