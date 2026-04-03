import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Loader2, Monitor, MousePointer } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface LiveBrowserPanelProps {
  url: string;
  isExecuting: boolean;
  currentCommand: string;
  stepNumber: number;
  totalSteps: number;
  pageTitle?: string;
  pageContent?: string;
  screenshot?: string | null;
}

const LiveBrowserPanel = ({
  url,
  isExecuting,
  currentCommand,
  stepNumber,
  pageTitle,
  pageContent,
  screenshot,
}: LiveBrowserPanelProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [url]);

  return (
    <div className="flex flex-col h-full border-l border-border overflow-hidden bg-background">
      {/* Browser chrome bar */}
      <div className="h-10 flex items-center gap-2 px-3 border-b border-border bg-secondary/50 shrink-0">
        <div className="flex gap-1.5 mr-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ff5f57" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#ffbd2e" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#28c840" }} />
        </div>

        <div className="flex-1 flex items-center gap-1.5 bg-background/60 rounded-md px-2.5 py-1 overflow-hidden">
          {isExecuting ? (
            <Loader2 size={11} className="animate-spin text-primary shrink-0" />
          ) : (
            <Globe size={11} className="text-muted-foreground shrink-0" />
          )}
          <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap overflow-hidden text-ellipsis">
            {url || "about:blank"}
          </span>
        </div>

        {isExecuting && (
          <div className="flex items-center gap-1 bg-primary/10 border border-primary/20 rounded px-2 py-0.5 shrink-0">
            <MousePointer size={9} className="text-primary" />
            <span className="text-[9px] text-primary font-semibold">Agent Active</span>
          </div>
        )}
      </div>

      {/* Browser viewport */}
      <div ref={contentRef} className="flex-1 relative overflow-auto bg-card">
        <AnimatePresence mode="wait">
          {screenshot ? (
            <motion.div
              key="screenshot"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full overflow-auto"
            >
              <img
                src={screenshot}
                alt="Live browser view"
                className="w-full h-auto block"
                style={{ cursor: "crosshair" }}
              />
            </motion.div>
          ) : url && pageContent ? (
            <motion.div
              key="page-content"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15 }}
              className="p-6"
            >
              {pageTitle && (
                <h2 className="text-lg font-semibold text-foreground mb-4 border-b border-border pb-3">
                  {pageTitle}
                </h2>
              )}
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{pageContent}</ReactMarkdown>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex flex-col items-center justify-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-secondary/50 flex items-center justify-center">
                <Monitor size={22} className="text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Browser will appear here when agent starts
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Execution overlay */}
        {isExecuting && currentCommand && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-3 pt-6 z-10">
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-primary" />
              <span className="text-[10px] text-foreground/70">Step {stepNumber}</span>
              <span className="text-[10px] text-foreground/50 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                {currentCommand}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="h-6 flex items-center justify-between px-2.5 border-t border-border bg-secondary/50 text-[9px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${
            isExecuting ? "bg-primary" : url ? "bg-[hsl(var(--success))]" : "bg-muted-foreground"
          }`} />
          {isExecuting ? "Working..." : url ? "Ready" : "Idle"}
        </span>
        <span className="font-mono">DataNauts Agent</span>
      </div>
    </div>
  );
};

export default LiveBrowserPanel;
