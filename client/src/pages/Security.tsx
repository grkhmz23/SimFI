import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  LogOut,
  Monitor,
  Globe,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

interface SessionInfo {
  current: {
    device: string;
    browser: string;
    ip: string;
    loginAt: string | null;
  };
  tokenVersion: number;
}

export default function Security() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading } = useQuery<SessionInfo>({
    queryKey: ["/api/auth/me/sessions"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me/sessions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch session info");
      return res.json();
    },
    enabled: !!user,
  });

  const logoutAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout-all", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to log out all sessions");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "All sessions logged out",
        description: "You have been logged out of all devices.",
      });
      queryClient.clear();
      logout();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not log out all sessions. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-raised)] p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-[var(--text-tertiary)] mb-4" />
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Sign In Required</h2>
          <p className="text-[var(--text-secondary)]">
            Please sign in to view and manage your session security.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl animate-page-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-premium)]/10">
            <Shield className="h-5 w-5 text-[var(--accent-premium)]" />
          </div>
          <h1 className="font-serif text-3xl font-medium text-[var(--text-primary)]">
            Security
          </h1>
        </div>
        <p className="text-[var(--text-secondary)]">
          Manage your active sessions and account security settings.
        </p>
      </div>

      {/* Current Session */}
      <Card className="card-raised mb-6">
        <div className="p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-[var(--accent-premium)]" />
            Current Session
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    Active now on {data.current.device}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {data.current.browser} • {data.current.ip}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-base)]">
                  <Globe className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">IP Address</p>
                    <p className="text-sm text-[var(--text-primary)] font-mono">{data.current.ip}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-base)]">
                  <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider">Last Login</p>
                    <p className="text-sm text-[var(--text-primary)]">
                      {data.current.loginAt
                        ? new Date(data.current.loginAt).toLocaleString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Log Out All Devices */}
      <Card className="card-raised border-red-500/10">
        <div className="p-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <LogOut className="h-4 w-4 text-red-400" />
            Log Out All Devices
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            This will invalidate all active sessions across all devices. You will need to sign in again.
          </p>

          {!confirming ? (
            <Button
              variant="outline"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => setConfirming(true)}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Log Out All Devices
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                Are you sure?
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => logoutAllMutation.mutate()}
                disabled={logoutAllMutation.isPending}
              >
                {logoutAllMutation.isPending ? "Logging out..." : "Yes, Log Out All"}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
