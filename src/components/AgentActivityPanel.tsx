import { motion, AnimatePresence } from "framer-motion";
import { Globe, Terminal, Eye } from "lucide-react";

export interface AgentActivity {
  currentUrl: string;
  currentStep: number;
  maxSteps: number;
  status: "idle" | "scanning" | "thinking" | "executing" | "complete";
  lastCommand?: string;
  elementsFound?: number;
}

const AgentActivityPanel = ({ activity }: { activity: AgentActivity }) => {
  const statusConfig = {
    idle: { label: "Idle", color: "text-muted-foreground" },
    scanning: { label: "Scanning DOM...", color: "text-accent" },
    thinking: { label: "AI Thinking...", color: "text-primary" },
    executing: { label: "Executing...", color: "text-warning" },
    complete: { label: "Complete", color: "text-[hsl(var(--success))]" },
  };

  const config = statusConfig[activity.status];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="border-b border-border"
    >
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              activity.status === "idle" ? "bg-muted-foreground" :
              activity.status === "complete" ? "bg-[hsl(var(--success))]" :
              "bg-primary animate-pulse"
            }`} />
            <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
          </div>

          {activity.currentUrl && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe size={12} />
              <span className="truncate max-w-[200px]">{activity.currentUrl}</span>
            </div>
          )}

          {activity.currentStep > 0 && (
            <span className="text-xs text-muted-foreground">
              Step {activity.currentStep}/{activity.maxSteps}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activity.elementsFound !== undefined && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Eye size={12} />
              {activity.elementsFound} elements
            </div>
          )}
          {activity.lastCommand && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-accent">
              <Terminal size={12} />
              {activity.lastCommand}
            </div>
          )}
        </div>
      </div>

      {activity.maxSteps > 0 && activity.status !== "idle" && (
        <div className="h-0.5 bg-secondary">
          <motion.div
            className="h-full gradient-accent"
            initial={{ width: 0 }}
            animate={{ width: `${(activity.currentStep / activity.maxSteps) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}
    </motion.div>
  );
};

export default AgentActivityPanel;
