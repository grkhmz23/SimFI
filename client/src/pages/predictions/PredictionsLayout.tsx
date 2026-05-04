import { PredictionPricesProvider } from "@/contexts/PredictionPricesProvider";
import { Navigation } from "@/components/Navigation";
import { MobileNav } from "@/components/MobileNav";
import { Footer } from "@/components/ui/footer";
import { ReactNode } from "react";

export default function PredictionsLayout({ children }: { children: ReactNode }) {
  return (
    <PredictionPricesProvider>
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] flex flex-col">
        <Navigation />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <MobileNav />
      </div>
    </PredictionPricesProvider>
  );
}
