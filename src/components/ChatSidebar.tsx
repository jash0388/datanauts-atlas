import { Plus, History, Zap } from "lucide-react";
import DataNautsLogo from "./DataNautsLogo";

interface ChatSession {
  id: string;
  title: string;
}

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeId: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
}

const ChatSidebar = ({ sessions, activeId, onNewChat, onSelect }: ChatSidebarProps) => (
  <aside className="w-72 glass border-r border-border flex flex-col h-full shrink-0">
    <div className="p-5">
      <DataNautsLogo />
    </div>

    <div className="px-4">
      <button
        onClick={onNewChat}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-lg border border-border text-foreground text-sm hover:bg-secondary transition-colors"
      >
        <Plus size={16} />
        New Chat
      </button>
    </div>

    <div className="flex-1 mt-6 px-4 overflow-y-auto scrollbar-thin">
      <p className="text-xs text-muted-foreground font-medium px-2 mb-2 flex items-center gap-1.5">
        <History size={12} />
        RECENT
      </p>
      {sessions.length === 0 && (
        <p className="text-xs text-muted-foreground px-2 italic">No chats yet</p>
      )}
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-colors ${
            activeId === s.id
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/50"
          }`}
        >
          {s.title}
        </button>
      ))}
    </div>

    <div className="p-4 border-t border-border">
      <div className="flex items-center gap-2 px-2">
        <Zap size={14} className="text-[hsl(var(--success))]" />
        <span className="text-xs font-medium text-[hsl(var(--success))]">Online</span>
      </div>
    </div>
  </aside>
);

export default ChatSidebar;
