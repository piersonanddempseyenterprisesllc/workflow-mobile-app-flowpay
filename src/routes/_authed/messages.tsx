import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authed/messages")({ component: MessagesPage });

function MessagesPage() {
  return (
    <div className="space-y-5 pb-32">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Chat</p>
        <h1 className="font-serif text-3xl mt-1">Messages</h1>
      </header>

      <div className="soft-card p-8 text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <MessageCircle className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="font-serif text-xl">Direct messages are coming next</h2>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          You'll be able to chat one-on-one with any colleague you've connected with. We're putting the finishing touches on it.
        </p>
      </div>
    </div>
  );
}
