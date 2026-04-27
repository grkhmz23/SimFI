import React, { Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { PriceProvider } from "@/lib/price-context";
import { ChainProvider } from "@/lib/chain-context";
import { WatchlistProvider } from "@/lib/watchlist-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Navigation } from "@/components/Navigation";
import { MobileNav } from "@/components/MobileNav";
import { Footer } from "@/components/ui/footer";
import { WelcomePopup } from "@/components/WelcomePopup";

/* ------------------------------------------------------------------
   Route-level code splitting
   Every page below is loaded on-demand so the initial bundle stays
   under ~400 KB gzipped.
   ------------------------------------------------------------------ */
const Login = React.lazy(() => import("@/pages/Login"));
const Register = React.lazy(() => import("@/pages/Register"));
const Trade = React.lazy(() => import("@/pages/Trade"));
const TradePage = React.lazy(() => import("@/pages/TradePage"));
const TokenPage = React.lazy(() => import("@/pages/TokenPage"));
const Trending = React.lazy(() => import("@/pages/Trending"));
const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const Portfolio = React.lazy(() => import("@/pages/Portfolio"));
const Positions = React.lazy(() => import("@/pages/Positions"));
const History = React.lazy(() => import("@/pages/History"));
const Leaderboard = React.lazy(() => import("@/pages/Leaderboard"));
const About = React.lazy(() => import("@/pages/About"));
const TokenAnalyzer = React.lazy(() => import("@/pages/TokenAnalyzer"));
const Referrals = React.lazy(() => import("@/pages/Referrals"));
const TraderProfile = React.lazy(() => import("@/pages/TraderProfile"));

const AlphaDesk = React.lazy(() => import("@/pages/AlphaDesk"));
const Watchlist = React.lazy(() => import("@/pages/Watchlist"));
const Analytics = React.lazy(() => import("@/pages/Analytics"));
const Security = React.lazy(() => import("@/pages/Security"));
const Rewards = React.lazy(() => import("@/pages/Rewards"));
const NotFound = React.lazy(() => import("@/pages/not-found"));

const DesignSystem = import.meta.env.DEV
  ? React.lazy(() => import("@/pages/DesignSystem"))
  : null;

function PageLayout({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Navigation />
      <Component />
      <Footer />
      <MobileNav />
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={<PageSkeleton />}>
          <Login />
        </Suspense>
      </Route>
      <Route path="/register">
        <Suspense fallback={<PageSkeleton />}>
          <Register />
        </Suspense>
      </Route>
      <Route path="/">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Trade} />
        </Suspense>
      </Route>
      <Route path="/token/:address">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={TokenPage} />
        </Suspense>
      </Route>
      <Route path="/trade">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={TradePage} />
        </Suspense>
      </Route>
      <Route path="/trending">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Trending} />
        </Suspense>
      </Route>
      <Route path="/dashboard">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Dashboard} />
        </Suspense>
      </Route>
      <Route path="/portfolio">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Portfolio} />
        </Suspense>
      </Route>
      <Route path="/positions">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Positions} />
        </Suspense>
      </Route>
      <Route path="/history">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={History} />
        </Suspense>
      </Route>
      <Route path="/leaderboard">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Leaderboard} />
        </Suspense>
      </Route>
      <Route path="/study">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={TokenAnalyzer} />
        </Suspense>
      </Route>
      <Route path="/about">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={About} />
        </Suspense>
      </Route>
      <Route path="/referrals">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Referrals} />
        </Suspense>
      </Route>
      <Route path="/trader/:username">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={TraderProfile} />
        </Suspense>
      </Route>

      <Route path="/alpha-desk">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={AlphaDesk} />
        </Suspense>
      </Route>
      <Route path="/watchlist">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Watchlist} />
        </Suspense>
      </Route>
      <Route path="/analytics">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Analytics} />
        </Suspense>
      </Route>
      <Route path="/security">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Security} />
        </Suspense>
      </Route>
      <Route path="/rewards">
        <Suspense fallback={<PageSkeleton />}>
          <PageLayout component={Rewards} />
        </Suspense>
      </Route>
      {import.meta.env.DEV && DesignSystem && (
        <Route path="/_design">
          <Suspense fallback={<PageSkeleton />}>
            <DesignSystem />
          </Suspense>
        </Route>
      )}
      <Route>
        <Suspense fallback={<PageSkeleton />}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
  );
}

/** Minimal skeleton shown while a route chunk is downloading. */
function PageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-subtle)] border-t-[var(--accent-premium)]" />
        <p className="text-xs text-[var(--text-tertiary)] font-mono uppercase tracking-wider">
          Loading
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <ChainProvider>
            <WatchlistProvider>
              <PriceProvider>
                <ErrorBoundary>
                  <Toaster />
                  <WelcomePopup 
                    delay={800}
                    showOncePerSession={false}
                  />
                  <Router />
                </ErrorBoundary>
              </PriceProvider>
            </WatchlistProvider>
          </ChainProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
