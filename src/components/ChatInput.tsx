import { useState, useRef, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Image, Paperclip, Sparkles, MessageSquare, Code, PenTool } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  isLoading: boolean;
}

const SUGGESTIONS = [
  { icon: Sparkles, label: "Analyze my emotions from text" },
  { icon: MessageSquare, label: "Help me brainstorm ideas" },
  { icon: Code, label: "Help me write some code" },
  { icon: PenTool, label: "Help me write a professional email" },
];

const ChatInput = ({ onSend, isLoading }: ChatInputProps) => {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((!input.trim() && images.length === 0) || isLoading) return;
    onSend(input.trim(), images.length > 0 ? images : undefined);
    setInput("");
    setImages([]);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    Array.from(e.target.files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  return (
    <div className="p-4 border-t border-border">
      {/* Suggestions */}
      {!isLoading && images.length === 0 && !input && (
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-thin pb-1">
          {SUGGESTIONS.map((s, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onSend(s.label)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors whitespace-nowrap shrink-0"
            >
              <s.icon size={12} />
              {s.label}
            </motion.button>
          ))}
        </div>
      )}

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <div key={i} className="relative shrink-0">
              <img src={img} alt="" className="w-16 h-16 rounded-lg object-cover border border-border" />
              <button
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageSelect}
      />

      <div className="flex items-end gap-2">
        <div className="flex-1 glass rounded-2xl border border-border focus-within:border-primary/40 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask DataNauts anything..."
            rows={1}
            className="w-full bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none"
            disabled={isLoading}
          />
          <div className="flex items-center gap-1 px-2 pb-1.5">
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isLoading}
              title="Attach image"
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <Image size={15} />
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isLoading}
              title="Attach file"
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <Paperclip size={15} />
            </button>
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={(!input.trim() && images.length === 0) || isLoading}
          className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center text-primary-foreground disabled:opacity-30 transition-opacity shrink-0"
        >
          <ArrowUp size={18} />
        </button>
      </div>

      <p className="text-[0.6rem] text-muted-foreground text-center mt-2">
        DataNauts AI understands your text, emotions & images • Powered by DataNauts
      </p>
    </div>
  );
};

export default ChatInput;
