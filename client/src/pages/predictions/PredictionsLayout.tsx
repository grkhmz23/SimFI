import { PredictionPricesProvider } from "@/contexts/PredictionPricesProvider";
import { ReactNode } from "react";

export default function PredictionsLayout({ children }: { children: ReactNode }) {
  return (
    <PredictionPricesProvider>
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
        {children}
      </div>
    </PredictionPricesProvider>
  );
}
