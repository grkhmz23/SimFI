import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { PriceProvider } from "@/lib/price-context";
import { Navigation } from "@/components/Navigation";

import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Trade from "@/pages/Trade";
import TokenPage from "@/pages/TokenPage";
import Dashboard from "@/pages/Dashboard";
import Portfolio from "@/pages/Portfolio";
import Positions from "@/pages/Positions";
import History from "@/pages/History";
import Leaderboard from "@/pages/Leaderboard";
import About from "@/pages/About";
import TokenAnalyzer from "@/pages/TokenAnalyzer";
import Trending from "@/pages/Trending";
import NotFound from "@/pages/not-found";

function PageLayout({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Navigation />
      <Component />
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Login />
      </Route>
      <Route path="/register">
        <Register />
      </Route>
      <Route path="/">
        <PageLayout component={Trade} />
      </Route>
      <Route path="/token/:address">
        <PageLayout component={TokenPage} />
      </Route>
      <Route path="/dashboard">
        <PageLayout component={Dashboard} />
      </Route>
      <Route path="/portfolio">
        <PageLayout component={Portfolio} />
      </Route>
      <Route path="/positions">
        <PageLayout component={Positions} />
      </Route>
      <Route path="/history">
        <PageLayout component={History} />
      </Route>
      <Route path="/leaderboard">
        <PageLayout component={Leaderboard} />
      </Route>
      <Route path="/study">
        <PageLayout component={TokenAnalyzer} />
      </Route>
      <Route path="/trending">
        <PageLayout component={Trending} />
      </Route>
      <Route path="/about">
        <PageLayout component={About} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PriceProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </PriceProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
