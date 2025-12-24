import { useEffect } from "react";
import { NavigationV2 } from "@/components/v2/NavigationV2";

function V2Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(99,102,241,0.18), transparent 40%), radial-gradient(circle at 80% 20%, rgba(34,197,94,0.12), transparent 45%), radial-gradient(circle at 40% 90%, rgba(236,72,153,0.10), transparent 45%)",
        }}
      />
      <div className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
    </div>
  );
}

export function AppShellV2({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("simfi-ui-v2");
    return () => document.documentElement.classList.remove("simfi-ui-v2");
  }, []);

  return (
    <div className="min-h-screen">
      <V2Background />
      <NavigationV2 />
      <main className="container mx-auto px-4 py-6 pb-24 md:pb-6 max-w-7xl">
        {children}
      </main>
    </div>
  );
}
