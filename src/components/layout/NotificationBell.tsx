import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Notification {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  readAt?: string;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState(false);
  const refresh = async () => {
    try {
      const response = await apiClient.get<{ items: Notification[]; unreadCount: number }>("/api/notifications");
      setItems(response.items); setUnread(response.unreadCount); setError(false);
    } catch { setError(true); }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const open = async (item: Notification) => {
    if (!item.readAt) {
      try { await apiClient.patch(`/api/notifications/${item.id}/read`, {}); setUnread((value) => Math.max(0, value - 1)); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)); }
      catch { /* Keep the destination usable if read state fails. */ }
    }
    navigate(item.url);
  };
  return <DropdownMenu onOpenChange={(isOpen) => { if (isOpen) void refresh(); }}>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${unread} unread`}>
      <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-signal px-1.5 text-[10px] font-bold text-signal-foreground">{unread > 99 ? "99+" : unread}</span>}
    </Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-h-[70vh] w-[min(90vw,380px)] overflow-y-auto border-border bg-surface-1">
      <DropdownMenuLabel>Notifications</DropdownMenuLabel>
      {error && <p className="px-2 py-3 text-sm text-destructive">Notifications are unavailable.</p>}
      {!error && items.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No notifications yet.</p>}
      {items.map((item) => <DropdownMenuItem key={item.id} onSelect={() => void open(item)} className="block cursor-pointer whitespace-normal border-t border-border p-3">
        <span className={item.readAt ? "text-sm text-muted-foreground" : "text-sm font-semibold text-white"}>{item.title}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{item.body}</span>
        <span className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
      </DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}
