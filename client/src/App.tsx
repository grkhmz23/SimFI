import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { TokenProvider } from "@/lib/websocket";
import { Navigation } from "@/components/Navigation";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Trade from "@/pages/Trade";
import Dashboard from "@/pages/Dashboard";
import Portfolio from "@/pages/Portfolio";
import History from "@/pages/History";
import Leaderboard from "@/pages/Leaderboard";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  
  return (
    <>
      <Navigation />
      <Component />
    </>
  );
}

function PublicRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated } = useAuth();
  
  if (isAuthenticated) {
    return <Redirect to="/" />;
  }
  
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <PublicRoute component={Login} />
      </Route>
      <Route path="/register">
        <PublicRoute component={Register} />
      </Route>
      <Route path="/">
        <ProtectedRoute component={Trade} />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route path="/portfolio">
        <ProtectedRoute component={Portfolio} />
      </Route>
      <Route path="/history">
        <ProtectedRoute component={History} />
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute component={Leaderboard} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <TokenProvider>
            <Toaster />
            <Router />
          </TokenProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
