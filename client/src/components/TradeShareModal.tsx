import { useRef, useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TradeShareCard } from './TradeShareCard';
import { Download, Loader2 } from 'lucide-react';
import type { Trade } from '@shared/schema';

interface TradeShareModalProps {
  trade: Trade | null;
  nativePrice: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TradeShareModal({ trade, nativePrice, open, onOpenChange }: TradeShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || !trade) return;
    setDownloading(true);
    try {
      // Wait for fonts + images to settle
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 300));

      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        skipFonts: false,
      });

      const link = document.createElement('a');
      const safeSymbol = trade.tokenSymbol.replace(/[^a-zA-Z0-9]/g, '');
      const dateStr = new Date(trade.closedAt).toISOString().split('T')[0];
      link.download = `simfi-${safeSymbol}-${dateStr}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to generate trade card:', err);
    } finally {
      setDownloading(false);
    }
  }, [trade]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Share Trade</DialogTitle>
          <DialogDescription>
            Preview your trade card and download as a PNG to share on Twitter/X.
          </DialogDescription>
        </DialogHeader>

        {/* Hidden off-screen rendered card for capture */}
        <div className="flex justify-center overflow-auto py-4">
          {trade && (
            <div
              style={{
                width: '100%',
                maxWidth: 600,
                aspectRatio: '1200 / 675',
                overflow: 'hidden',
                borderRadius: 12,
                boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
              }}
            >
              <div
                style={{
                  transform: 'scale(0.5)',
                  transformOrigin: 'top left',
                  width: 1200,
                  height: 675,
                }}
              >
                <TradeShareCard ref={cardRef} trade={trade} nativePrice={nativePrice} />
              </div>
            </div>
          )}
        </div>

        {/* Also keep the actual capture element mounted but hidden */}
        <div
          style={{
            position: 'fixed',
            top: -9999,
            left: -9999,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {trade && (
            <TradeShareCard ref={cardRef} trade={trade} nativePrice={nativePrice} />
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleDownload} disabled={downloading} className="gap-2">
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
