import { Rocket } from "lucide-react";

const DataNautsLogo = () => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 rounded-xl gradient-accent flex items-center justify-center" style={{ animation: "pulse-glow 3s ease-in-out infinite" }}>
      <Rocket size={18} className="text-primary-foreground" />
    </div>
    <div>
      <h1 className="text-base font-bold tracking-tight gradient-text">DataNauts</h1>
      <p className="text-[0.6rem] text-muted-foreground -mt-0.5">AI Assistant</p>
    </div>
  </div>
);

export default DataNautsLogo;
