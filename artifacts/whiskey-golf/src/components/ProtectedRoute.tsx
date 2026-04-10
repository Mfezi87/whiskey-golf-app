import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useEffect, type ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      const current = window.location.pathname + window.location.search;
      if (current !== "/" && current !== "/login" && current !== "/register") {
        sessionStorage.setItem("returnTo", current);
      }
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;
  return <>{children}</>;
}
