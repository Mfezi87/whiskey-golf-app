import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
import TournamentsPage from "@/pages/tournaments";
import NewTournamentPage from "@/pages/new-tournament";
import TournamentDetailPage from "@/pages/tournament-detail";
import LeaderboardPage from "@/pages/leaderboard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/");
    }
  }, [user, isLoading, setLocation]);
  if (isLoading || user) return null;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicOnlyRoute><LoginPage /></PublicOnlyRoute>
      </Route>
      <Route path="/register">
        <PublicOnlyRoute><RegisterPage /></PublicOnlyRoute>
      </Route>
      <Route path="/">
        <ProtectedRoute><DashboardPage /></ProtectedRoute>
      </Route>
      <Route path="/tournaments">
        <ProtectedRoute><TournamentsPage /></ProtectedRoute>
      </Route>
      <Route path="/tournaments/new">
        <ProtectedRoute><NewTournamentPage /></ProtectedRoute>
      </Route>
      <Route path="/tournaments/:id">
        <ProtectedRoute><TournamentDetailPage /></ProtectedRoute>
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute><LeaderboardPage /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
