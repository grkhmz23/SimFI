import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-base)] px-4">
      <Card className="w-full max-w-md text-center p-10">
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-base)] border border-[var(--border-subtle)]">
            <AlertCircle className="h-8 w-8 text-[var(--accent-loss)]" />
          </div>
        </div>
        <h1 className="font-serif text-3xl text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
          404
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-8">
          This page doesn&apos;t exist. It might have been moved or deleted.
        </p>
        <Button onClick={() => setLocation('/')} variant="outline" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Button>
      </Card>
    </div>
  );
}
