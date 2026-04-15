import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Share2 } from "lucide-react";

interface SharePnLCardProps {
  title: string;
  value: string;
  subtext: string;
  chain: "base" | "solana";
  trigger?: React.ReactNode;
}

export function SharePnLCard({ title, value, subtext, chain, trigger }: SharePnLCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = 600;
    const height = 400;
    canvas.width = width;
    canvas.height = height;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Grid pattern
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Logo
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px Inter, sans-serif";
    ctx.fillText("SimFi", 40, 60);

    // Chain badge
    ctx.fillStyle = chain === "base" ? "#0052ff" : "#a855f7";
    ctx.roundRect(500, 30, 60, 28, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Inter, sans-serif";
    ctx.fillText(chain.toUpperCase(), 515, 48);

    // Title
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText(title.toUpperCase(), 40, 140);

    // Big value
    ctx.fillStyle = value.startsWith("+") ? "#22c55e" : "#fff";
    ctx.font = "bold 72px Inter, sans-serif";
    ctx.fillText(value, 40, 230);

    // Subtext
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "20px Inter, sans-serif";
    ctx.fillText(subtext, 40, 280);

    // Footer
    ctx.fillStyle = "#64748b";
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText("Practice risk-free trading on SimFi", 40, 360);
  };

  const download = () => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `simfi-share-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const tweet = () => {
    const text = `I just ${title.toLowerCase()} ${value} ${subtext} on SimFi paper trading 🔥 Try it free:`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://simfi.fun")}`;
    window.open(url, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild onClick={() => setTimeout(draw, 100)}>
        {trigger || (
          <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share your win</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <canvas
            ref={canvasRef}
            className="w-full max-w-[600px] rounded-xl border shadow-2xl"
            style={{ aspectRatio: "3/2" }}
          />
          <div className="flex gap-2">
            <Button onClick={download}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button variant="secondary" onClick={tweet}>
              Post to X
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
