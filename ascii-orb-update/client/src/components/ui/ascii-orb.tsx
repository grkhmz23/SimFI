import React, { useEffect, useRef, memo } from 'react';

interface AsciiOrbProps {
  hue?: number; // Default 172 for SimFi green
  size?: number; // Size in pixels
  className?: string;
}

export const AsciiOrb = memo(({ hue = 172, size = 400, className = '' }: AsciiOrbProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainCanvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const timeRef = useRef(0);
  const paramsRef = useRef({
    rotation: 0,
    atmosphereShift: 0,
    glitchIntensity: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const grainCanvas = grainCanvasRef.current;
    if (!canvas || !grainCanvas) return;

    const ctx = canvas.getContext('2d');
    const grainCtx = grainCanvas.getContext('2d');
    if (!ctx || !grainCtx) return;

    const density = ' .:-=+*#%@';
    const params = paramsRef.current;

    // Animation timers
    let rotationTime = 0;
    let atmosphereTime = 0;
    let glitchTimer = 0;
    let nextGlitchTime = Math.random() * 3 + 1;

    const generateFilmGrain = (width: number, height: number, intensity = 0.15) => {
      const imageData = grainCtx.createImageData(width, height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const grain = (Math.random() - 0.5) * intensity * 255;
        data[i] = Math.max(0, Math.min(255, 128 + grain));
        data[i + 1] = Math.max(0, Math.min(255, 128 + grain));
        data[i + 2] = Math.max(0, Math.min(255, 128 + grain));
        data[i + 3] = Math.abs(grain) * 3;
      }

      return imageData;
    };

    const drawGlitchedOrb = (
      centerX: number,
      centerY: number,
      radius: number,
      orbHue: number,
      time: number,
      glitchIntensity: number
    ) => {
      ctx.save();

      const shouldGlitch = Math.random() < 0.1 && glitchIntensity > 0.5;
      const glitchOffset = shouldGlitch ? (Math.random() - 0.5) * 20 * glitchIntensity : 0;
      const glitchScale = shouldGlitch ? 1 + (Math.random() - 0.5) * 0.3 * glitchIntensity : 1;

      if (shouldGlitch) {
        ctx.translate(glitchOffset, glitchOffset * 0.8);
        ctx.scale(glitchScale, 1 / glitchScale);
      }

      // Main orb gradient - GREEN
      const orbGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 1.5);
      orbGradient.addColorStop(0, `hsla(${orbHue + 10}, 100%, 85%, 0.9)`);
      orbGradient.addColorStop(0.2, `hsla(${orbHue + 15}, 90%, 70%, 0.7)`);
      orbGradient.addColorStop(0.5, `hsla(${orbHue}, 70%, 45%, 0.4)`);
      orbGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = orbGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Bright center
      const centerRadius = radius * 0.3;
      ctx.fillStyle = `hsla(${orbHue + 15}, 100%, 90%, 0.8)`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
      ctx.fill();

      // Glitch effects
      if (shouldGlitch) {
        ctx.globalCompositeOperation = 'screen';

        // Green channel offset
        ctx.fillStyle = `hsla(${orbHue - 20}, 100%, 50%, ${0.5 * glitchIntensity})`;
        ctx.beginPath();
        ctx.arc(centerX + glitchOffset * 0.5, centerY, centerRadius, 0, Math.PI * 2);
        ctx.fill();

        // Cyan channel offset
        ctx.fillStyle = `hsla(${orbHue + 40}, 100%, 50%, ${0.4 * glitchIntensity})`;
        ctx.beginPath();
        ctx.arc(centerX - glitchOffset * 0.5, centerY, centerRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';

        // Digital noise lines
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * glitchIntensity})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const y = centerY - radius + Math.random() * radius * 2;
          const startX = centerX - radius + Math.random() * 20;
          const endX = centerX + radius - Math.random() * 20;
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();
        }

        // Pixelated corruption blocks - green tinted
        ctx.fillStyle = `hsla(${orbHue}, 100%, 50%, ${0.4 * glitchIntensity})`;
        for (let i = 0; i < 3; i++) {
          const blockX = centerX - radius + Math.random() * radius * 2;
          const blockY = centerY - radius + Math.random() * radius * 2;
          const blockSize = Math.random() * 10 + 2;
          ctx.fillRect(blockX, blockY, blockSize, blockSize);
        }
      }

      // Outer ring
      ctx.strokeStyle = `hsla(${orbHue + 15}, 80%, 60%, 0.5)`;
      ctx.lineWidth = 2;

      if (shouldGlitch) {
        const segments = 8;
        for (let i = 0; i < segments; i++) {
          const startAngle = (i / segments) * Math.PI * 2;
          const endAngle = ((i + 1) / segments) * Math.PI * 2;
          const ringRadius = radius * 1.15 + (Math.random() - 0.5) * 10 * glitchIntensity;
          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius, startAngle, endAngle);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius * 1.15, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Data corruption bars
      if (shouldGlitch && Math.random() < 0.3) {
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * glitchIntensity})`;
        for (let i = 0; i < 2; i++) {
          const barY = centerY - radius + Math.random() * radius * 2;
          const barHeight = Math.random() * 4 + 1;
          ctx.fillRect(centerX - radius, barY, radius * 2, barHeight);
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.restore();
    };

    function render() {
      const deltaTime = 0.016;
      timeRef.current += deltaTime;
      const time = timeRef.current;

      // Update animation params
      rotationTime += deltaTime;
      atmosphereTime += deltaTime;
      glitchTimer += deltaTime;

      params.rotation = (rotationTime / 20) * Math.PI * 2;
      params.atmosphereShift = (Math.sin(atmosphereTime / 6 * Math.PI * 2) + 1) / 2;

      // Glitch timing
      if (glitchTimer > nextGlitchTime) {
        params.glitchIntensity = Math.random() > 0.5 ? 1 : 0;
        if (params.glitchIntensity > 0) {
          setTimeout(() => {
            params.glitchIntensity = 0;
          }, 100 + Math.random() * 100);
        }
        glitchTimer = 0;
        nextGlitchTime = Math.random() * 3 + 1;
      }

      const width = (canvas.width = grainCanvas.width = size);
      const height = (canvas.height = grainCanvas.height = size);

      // Clear with transparent
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.25;

      // Background glow
      const bgGradient = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        Math.max(width, height) * 0.6
      );

      const currentHue = hue + params.atmosphereShift * 20;
      bgGradient.addColorStop(0, `hsla(${currentHue + 20}, 80%, 50%, 0.3)`);
      bgGradient.addColorStop(0.3, `hsla(${currentHue}, 60%, 35%, 0.2)`);
      bgGradient.addColorStop(0.6, `hsla(${currentHue - 10}, 40%, 20%, 0.1)`);
      bgGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      // Draw orb
      drawGlitchedOrb(centerX, centerY, radius, currentHue, time, params.glitchIntensity);

      // ASCII sphere particles
      ctx.font = '9px "JetBrains Mono", "Fira Code", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const spacing = 8;
      const cols = Math.floor(width / spacing);
      const rows = Math.floor(height / spacing);

      for (let i = 0; i < Math.min(cols, 60); i++) {
        for (let j = 0; j < Math.min(rows, 60); j++) {
          const x = (i - cols / 2) * spacing + centerX;
          const y = (j - rows / 2) * spacing + centerY;

          const dx = x - centerX;
          const dy = y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < radius && Math.random() > 0.4) {
            const z = Math.sqrt(Math.max(0, radius * radius - dx * dx - dy * dy));
            const angle = params.rotation;
            const rotZ = dx * Math.sin(angle) + z * Math.cos(angle);
            const brightness = (rotZ + radius) / (radius * 2);

            if (rotZ > -radius * 0.3) {
              const charIndex = Math.floor(brightness * (density.length - 1));
              let char = density[charIndex];

              // Glitch ASCII
              if (dist < radius * 0.8 && params.glitchIntensity > 0.8 && Math.random() < 0.3) {
                const glitchChars = ['█', '▓', '▒', '░', '▄', '▀', '■', '□'];
                char = glitchChars[Math.floor(Math.random() * glitchChars.length)];
              }

              const alpha = Math.max(0.3, brightness);
              ctx.fillStyle = `hsla(${hue}, 50%, 90%, ${alpha})`;
              ctx.fillText(char, x, y);
            }
          }
        }
      }

      // Film grain
      grainCtx.clearRect(0, 0, width, height);
      const grainIntensity = 0.18 + Math.sin(time * 10) * 0.02;
      const grainImageData = generateFilmGrain(width, height, grainIntensity);
      grainCtx.putImageData(grainImageData, 0, 0);

      // Enhanced grain during glitch
      if (params.glitchIntensity > 0.5) {
        grainCtx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 100; i++) {
          const gx = Math.random() * width;
          const gy = Math.random() * height;
          const gsize = Math.random() * 2 + 0.5;
          const gopacity = Math.random() * 0.4 * params.glitchIntensity;
          grainCtx.fillStyle = `rgba(255, 255, 255, ${gopacity})`;
          grainCtx.beginPath();
          grainCtx.arc(gx, gy, gsize, 0, Math.PI * 2);
          grainCtx.fill();
        }
        grainCtx.globalCompositeOperation = 'source-over';
      }

      frameRef.current = requestAnimationFrame(render);
    }

    render();

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [hue, size]);

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
      <canvas
        ref={grainCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          mixBlendMode: 'overlay',
          opacity: 0.5,
        }}
      />
    </div>
  );
});

AsciiOrb.displayName = 'AsciiOrb';

export default AsciiOrb;
