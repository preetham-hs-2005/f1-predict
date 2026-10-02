import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function SetUsernameModal() {
  const { user, isAuthenticated, setUsername } = useAuth();
  const [usernameInput, setUsernameInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Show modal if authenticated but no username
  const isOpen = isAuthenticated && user?.emailVerified && !user.username;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (usernameInput.length < 3 || usernameInput.length > 20) {
      toast.error("Username must be 3-20 characters");
      return;
    }
    
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(usernameInput)) {
      toast.error("Username can only contain letters, numbers, underscores, and hyphens");
      return;
    }

    setLoading(true);
    const result = await setUsername(usernameInput);
    
    if (result.success) {
      toast.success("Username set successfully!");
    } else {
      toast.error(result.error || "Failed to set username");
    }
    setLoading(false);
  };

  return (
    <Dialog open={!!isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[425px] hide-close-button [&>button]:hidden border-primary/20 bg-card">
        <DialogHeader>
          <DialogTitle className="f1-heading text-2xl">Set Your Username</DialogTitle>
          <DialogDescription>
            You must set a unique username to continue using F1 Predict. This will be shown on the leaderboard and discussions.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="global-username">Username</Label>
            <Input
              id="global-username"
              placeholder="e.g. smooth_operator_55"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              required
              disabled={loading}
              className="bg-background/50"
            />
            <p className="text-xs text-muted-foreground mt-1 text-right">
              3-20 characters, no spaces
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Save Username"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
