// <DOCUMENT filename="AIBotPanel.tsx">
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const AIBotPanel = () => {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello! I'm your AI study assistant. I can help explain concepts, answer questions, and provide additional resources. What would you like to know?",
    },
  ]);

  const [newQuestion, setNewQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || isLoading) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: "user",
      content: newQuestion,
    };

    setMessages((prev) => [...prev, userMessage]);
    setNewQuestion("");
    setIsLoading(true);

    try {
      const res = await fetch("http://localhost:4000/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: newQuestion }),
      });

      const data = await res.json();
      if (!data.response) throw new Error("No response from AI");

      const aiMessage: AIMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: "assistant",
          content: "Sorry, something went wrong while fetching the AI response.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 p-4">
      {/* Header */}
      <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-medium">AI Study Assistant Active</span>
        </div>
      </div>

      {/* Scrollable Messages Area */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    message.role === "assistant"
                      ? "bg-gradient-to-br from-primary to-secondary"
                      : "bg-accent"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <Sparkles className="w-4 h-4 text-white" />
                  ) : (
                    <span className="text-xs text-white font-bold">You</span>
                  )}
                </div>

                <div
                  className={`p-3 rounded-lg max-w-xl ${
                    message.role === "user" ? "bg-accent/20" : "bg-muted/50"
                  } prose prose-sm dark:prose-invert`}
                >
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <Input
          placeholder="Ask AI a question..."
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          className="flex-1"
          disabled={isLoading}
        />
        <Button
          type="submit"
          size="icon"
          className="bg-gradient-to-br from-primary to-secondary"
          disabled={isLoading || !newQuestion.trim()}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </form>
    </div>
  );
};

export default AIBotPanel;