import { Rocket } from "lucide-react";

const TypingIndicator = () => (
  <div className="flex gap-3">
    <div className="w-8 h-8 rounded-lg gradient-accent flex items-center justify-center shrink-0">
      <Rocket size={16} className="text-primary-foreground" />
    </div>
    <div className="glass border border-border rounded-2xl px-4 py-3 flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary"
          style={{ animation: `typing-dots 1.4s ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  </div>
);

export default TypingIndicator;
