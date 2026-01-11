  import { Card } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Input } from '@/components/ui/input';
  import { Button } from '@/components/ui/button';
  import { useLocation } from 'wouter';
  import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
  import { 
    GraduationCap, 
    Shield, 
    Trophy, 
    Heart, 
    Coins, 
    TrendingUp, 
    Users, 
    Target,
    Rocket,
    AlertCircle,
    ExternalLink,
    Sparkles,
    Zap,
    BarChart3,
    ChevronDown,
    Search,
    SlidersHorizontal
  } from 'lucide-react';
  import { SiX } from 'react-icons/si';
  import { motion, AnimatePresence } from 'framer-motion';
  import { cn } from '@/lib/utils';

  // =============================================================================
  // GLOWING EFFECT COMPONENT
  // =============================================================================
  interface GlowingEffectProps {
    blur?: number;
    inactiveZone?: number;
    proximity?: number;
    spread?: number;
    variant?: "default" | "white";
    glow?: boolean;
    className?: string;
    disabled?: boolean;
    movementDuration?: number;
    borderWidth?: number;
  }

  const GlowingEffect = memo(({
    blur = 0,
    inactiveZone = 0.7,
    proximity = 0,
    spread = 20,
    variant = "default",
    glow = false,
    className,
    movementDuration = 2,
    borderWidth = 1,
    disabled = true,
  }: GlowingEffectProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastPosition = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number>(0);
    const currentAngleRef = useRef(0);

    const handleMove = useCallback(
      (e?: MouseEvent | { x: number; y: number }) => {
        if (!containerRef.current) return;

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          const element = containerRef.current;
          if (!element) return;

          const { left, top, width, height } = element.getBoundingClientRect();
          const mouseX = e?.x ?? lastPosition.current.x;
          const mouseY = e?.y ?? lastPosition.current.y;

          if (e) {
            lastPosition.current = { x: mouseX, y: mouseY };
          }

          const center = [left + width * 0.5, top + height * 0.5];
          const distanceFromCenter = Math.hypot(mouseX - center[0], mouseY - center[1]);
          const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

          if (distanceFromCenter < inactiveRadius) {
            element.style.setProperty("--active", "0");
            return;
          }

          const isActive =
            mouseX > left - proximity &&
            mouseX < left + width + proximity &&
            mouseY > top - proximity &&
            mouseY < top + height + proximity;

          element.style.setProperty("--active", isActive ? "1" : "0");

          if (!isActive) return;

          let targetAngle = (180 * Math.atan2(mouseY - center[1], mouseX - center[0])) / Math.PI + 90;
          const angleDiff = ((targetAngle - currentAngleRef.current + 180) % 360) - 180;
          const newAngle = currentAngleRef.current + angleDiff;

          const startAngle = currentAngleRef.current;
          const startTime = performance.now();
          const duration = movementDuration * 1000;

          const animateAngle = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = startAngle + (newAngle - startAngle) * eased;
            element.style.setProperty("--start", String(value));
            currentAngleRef.current = value;
            if (progress < 1) requestAnimationFrame(animateAngle);
          };

          requestAnimationFrame(animateAngle);
        });
      },
      [inactiveZone, proximity, movementDuration]
    );

    useEffect(() => {
      if (disabled) return;

      const handleScroll = () => handleMove();
      const handlePointerMove = (e: PointerEvent) => handleMove(e);

      window.addEventListener("scroll", handleScroll, { passive: true });
      document.body.addEventListener("pointermove", handlePointerMove, { passive: true });

      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        window.removeEventListener("scroll", handleScroll);
        document.body.removeEventListener("pointermove", handlePointerMove);
      };
    }, [handleMove, disabled]);

    return (
      <>
        <div className={cn(
          "pointer-events-none absolute -inset-px hidden rounded-[inherit] border opacity-0 transition-opacity",
          glow && "opacity-100",
          variant === "white" && "border-white",
          disabled && "!block"
        )} />
        <div
          ref={containerRef}
          style={{
            "--blur": `${blur}px`,
            "--spread": spread,
            "--start": "0",
            "--active": "0",
            "--glowingeffect-border-width": `${borderWidth}px`,
            "--repeating-conic-gradient-times": "5",
            "--gradient": variant === "white"
              ? `repeating-conic-gradient(from 236.84deg at 50% 50%, var(--black), var(--black) calc(25% / var(--repeating-conic-gradient-times)))`
              : `radial-gradient(circle, #dd7bbb 10%, #dd7bbb00 20%),
                 radial-gradient(circle at 40% 40%, #d79f1e 5%, #d79f1e00 15%),
                 radial-gradient(circle at 60% 60%, #5a922c 10%, #5a922c00 20%), 
                 radial-gradient(circle at 40% 60%, #4c7894 10%, #4c789400 20%),
                 repeating-conic-gradient(from 236.84deg at 50% 50%, #dd7bbb 0%, #d79f1e calc(25% / var(--repeating-conic-gradient-times)), #5a922c calc(50% / var(--repeating-conic-gradient-times)), #4c7894 calc(75% / var(--repeating-conic-gradient-times)), #dd7bbb calc(100% / var(--repeating-conic-gradient-times)))`,
          } as React.CSSProperties}
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity",
            glow && "opacity-100",
            blur > 0 && "blur-[var(--blur)]",
            className,
            disabled && "!hidden"
          )}
        >
          <div className={cn(
            "glow rounded-[inherit]",
            'after:content-[""] after:rounded-[inherit] after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))]',
            "after:[border:var(--glowingeffect-border-width)_solid_transparent]",
            "after:[background:var(--gradient)] after:[background-attachment:fixed]",
            "after:opacity-[var(--active)] after:transition-opacity after:duration-300",
            "after:[mask-clip:padding-box,border-box]",
            "after:[mask-composite:intersect]",
            "after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]"
          )} />
        </div>
      </>
    );
  });

  GlowingEffect.displayName = "GlowingEffect";

  // =============================================================================
  // ANIMATED SEARCH BAR COMPONENT
  // =============================================================================
  interface AnimatedSearchBarProps {
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    onSearch?: (value: string) => void;
    className?: string;
  }

  const AnimatedSearchBar: React.FC<AnimatedSearchBarProps> = ({
    placeholder = "Search tokens...",
    value: controlledValue,
    onChange,
    onSearch,
    className,
  }) => {
    const [internalValue, setInternalValue] = useState('');
    const value = controlledValue ?? internalValue;

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (onChange) onChange(newValue);
      else setInternalValue(newValue);
    }, [onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && onSearch) onSearch(value);
    }, [onSearch, value]);

    return (
      <div className={cn("relative flex items-center justify-center", className)}>
        <div className="relative flex items-center justify-center group">
          {/* Glow layers */}
          <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[70px] max-w-[314px] rounded-xl blur-[3px] 
            before:absolute before:content-[''] before:z-[-2] before:w-[999px] before:h-[999px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[60deg]
            before:bg-[conic-gradient(#000,#402fb5_5%,#000_38%,#000_50%,#cf30aa_60%,#000_87%)] before:transition-all before:duration-[2000ms]
            group-hover:before:rotate-[-120deg] group-focus-within:before:rotate-[420deg] group-focus-within:before:duration-[4000ms]" />
          <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[65px] max-w-[312px] rounded-xl blur-[3px] 
            before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[82deg]
            before:bg-[conic-gradient(rgba(0,0,0,0),#18116a,rgba(0,0,0,0)_10%,rgba(0,0,0,0)_50%,#6e1b60,rgba(0,0,0,0)_60%)] before:transition-all before:duration-[2000ms]
            group-hover:before:rotate-[-98deg] group-focus-within:before:rotate-[442deg] group-focus-within:before:duration-[4000ms]" />
          <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[63px] max-w-[307px] rounded-lg blur-[2px] 
            before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[83deg]
            before:bg-[conic-gradient(rgba(0,0,0,0)_0%,#a099d8,rgba(0,0,0,0)_8%,rgba(0,0,0,0)_50%,#dfa2da,rgba(0,0,0,0)_58%)]
            before:transition-all before:duration-[2000ms] group-hover:before:rotate-[-97deg] group-focus-within:before:rotate-[443deg] group-focus-within:before:duration-[4000ms]" />
          <div className="absolute z-[-1] overflow-hidden h-full w-full max-h-[59px] max-w-[303px] rounded-xl blur-[0.5px] 
            before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[70deg]
            before:bg-[conic-gradient(#1c191c,#402fb5_5%,#1c191c_14%,#1c191c_50%,#cf30aa_60%,#1c191c_64%)]
            before:transition-all before:duration-[2000ms] group-hover:before:rotate-[-110deg] group-focus-within:before:rotate-[430deg] group-focus-within:before:duration-[4000ms]" />

          {/* Input */}
          <div className="relative group">
            <input 
              placeholder={placeholder}
              type="text" 
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              className="bg-[#010201] border-none w-[301px] h-[56px] rounded-lg text-white px-[59px] text-base focus:outline-none placeholder-gray-400" 
            />
            <div className="pointer-events-none w-[100px] h-[20px] absolute bg-gradient-to-r from-transparent to-[#010201] top-[18px] left-[70px] group-focus-within:hidden" />
            <div className="pointer-events-none w-[30px] h-[20px] absolute bg-[#cf30aa] top-[10px] left-[5px] blur-2xl opacity-80 transition-all duration-[2000ms] group-hover:opacity-0" />
            <div className="absolute left-5 top-[15px]">
              <Search className="h-6 w-6 text-gray-400" />
            </div>
            <button className="absolute top-2 right-2 flex items-center justify-center z-[2] h-10 w-[38px] overflow-hidden rounded-lg bg-gradient-to-b from-[#161329] via-black to-[#1d1b4b] border border-transparent hover:border-purple-500/30 transition-colors">
              <SlidersHorizontal className="h-5 w-5 text-gray-300" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // LIGHTNING BACKGROUND COMPONENT (WebGL Shader)
  // =============================================================================
  interface LightningProps {
    hue?: number;
    xOffset?: number;
    speed?: number;
    intensity?: number;
    size?: number;
  }

  const Lightning: React.FC<LightningProps> = ({
    hue = 180,
    xOffset = 0,
    speed = 1,
    intensity = 1,
    size = 1,
  }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resizeCanvas = () => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      };
      resizeCanvas();
      window.addEventListener("resize", resizeCanvas);

      const gl = canvas.getContext("webgl");
      if (!gl) {
        console.error("WebGL not supported");
        return;
      }

      const vertexShaderSource = `
        attribute vec2 aPosition;
        void main() {
          gl_Position = vec4(aPosition, 0.0, 1.0);
        }
      `;

      const fragmentShaderSource = `
        precision mediump float;
        uniform vec2 iResolution;
        uniform float iTime;
        uniform float uHue;
        uniform float uXOffset;
        uniform float uSpeed;
        uniform float uIntensity;
        uniform float uSize;

        #define OCTAVE_COUNT 10

        vec3 hsv2rgb(vec3 c) {
          vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
          return c.z * mix(vec3(1.0), rgb, c.y);
        }

        float hash11(float p) {
          p = fract(p * .1031);
          p *= p + 33.33;
          p *= p + p;
          return fract(p);
        }

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * .1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        mat2 rotate2d(float theta) {
          float c = cos(theta);
          float s = sin(theta);
          return mat2(c, -s, s, c);
        }

        float noise(vec2 p) {
          vec2 ip = floor(p);
          vec2 fp = fract(p);
          float a = hash12(ip);
          float b = hash12(ip + vec2(1.0, 0.0));
          float c = hash12(ip + vec2(0.0, 1.0));
          float d = hash12(ip + vec2(1.0, 1.0));
          vec2 t = smoothstep(0.0, 1.0, fp);
          return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < OCTAVE_COUNT; ++i) {
            value += amplitude * noise(p);
            p *= rotate2d(0.45);
            p *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / iResolution.xy;
          uv = 2.0 * uv - 1.0;
          uv.x *= iResolution.x / iResolution.y;
          uv.x += uXOffset;
          uv += 2.0 * fbm(uv * uSize + 0.8 * iTime * uSpeed) - 1.0;
          float dist = abs(uv.x);
          vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
          vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * uSpeed)) / dist, 1.0) * uIntensity;
          gl_FragColor = vec4(col, 1.0);
        }
      `;

      const compileShader = (source: string, type: number): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("Shader compile error:", gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
      const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
      if (!vertexShader || !fragmentShader) return;

      const program = gl.createProgram();
      if (!program) return;
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Program linking error:", gl.getProgramInfoLog(program));
        return;
      }
      gl.useProgram(program);

      const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const aPosition = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

      const iResolutionLocation = gl.getUniformLocation(program, "iResolution");
      const iTimeLocation = gl.getUniformLocation(program, "iTime");
      const uHueLocation = gl.getUniformLocation(program, "uHue");
      const uXOffsetLocation = gl.getUniformLocation(program, "uXOffset");
      const uSpeedLocation = gl.getUniformLocation(program, "uSpeed");
      const uIntensityLocation = gl.getUniformLocation(program, "uIntensity");
      const uSizeLocation = gl.getUniformLocation(program, "uSize");

      const startTime = performance.now();
      let animationId: number;

      const render = () => {
        resizeCanvas();
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(iResolutionLocation, canvas.width, canvas.height);
        gl.uniform1f(iTimeLocation, (performance.now() - startTime) / 1000.0);
        gl.uniform1f(uHueLocation, hue);
        gl.uniform1f(uXOffsetLocation, xOffset);
        gl.uniform1f(uSpeedLocation, speed);
        gl.uniform1f(uIntensityLocation, intensity);
        gl.uniform1f(uSizeLocation, size);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        animationId = requestAnimationFrame(render);
      };
      animationId = requestAnimationFrame(render);

      return () => {
        window.removeEventListener("resize", resizeCanvas);
        cancelAnimationFrame(animationId);
      };
    }, [hue, xOffset, speed, intensity, size]);

    return <canvas ref={canvasRef} className="w-full h-full absolute inset-0" />;
  };

  // =============================================================================
  // FEATURE CARD WITH GLOWING EFFECT
  // =============================================================================
  interface FeatureCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
  }

  const FeatureCard = ({ icon, title, description }: FeatureCardProps) => {
    return (
      <div className="min-h-[14rem] list-none">
        <div className="relative h-full rounded-[1.25rem] border border-border p-2 md:rounded-[1.5rem] md:p-3">
          <GlowingEffect
            spread={40}
            glow={true}
            disabled={false}
            proximity={64}
            inactiveZone={0.01}
            borderWidth={3}
          />
          <div className="relative flex h-full flex-col justify-between gap-6 overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="relative flex flex-1 flex-col justify-between gap-3">
              <div className="w-fit rounded-lg border border-border bg-muted p-2">
                {icon}
              </div>
              <div className="space-y-3">
                <h3 className="pt-0.5 text-xl leading-[1.375rem] font-semibold tracking-tight md:text-2xl md:leading-[1.875rem] text-foreground">
                  {title}
                </h3>
                <p className="text-sm leading-[1.125rem] md:text-base md:leading-[1.375rem] text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // =============================================================================
  // GRADIENT BUTTON
  // =============================================================================
  interface GradientButtonProps {
    children: React.ReactNode;
    onClick: () => void;
    className?: string;
  }

  const GradientButton = ({ children, onClick, className }: GradientButtonProps) => {
    return (
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "relative px-8 py-4 rounded-full font-semibold text-lg overflow-hidden group",
          "bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%]",
          "hover:bg-[position:100%_0] transition-all duration-500",
          "text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40",
          className
        )}
      >
        <span className="relative z-10 flex items-center gap-2">
          {children}
        </span>
      </motion.button>
    );
  };

  // =============================================================================
  // ANIMATION VARIANTS
  // =============================================================================
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
    }
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  // =============================================================================
  // MAIN ABOUT PAGE COMPONENT
  // =============================================================================
  export default function About() {
    const [, setLocation] = useLocation();
    const [searchQuery, setSearchQuery] = useState('');

    return (
      <div className="min-h-screen bg-background overflow-x-hidden">
        {/* ===== HERO SECTION WITH LIGHTNING BACKGROUND ===== */}
        <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
          {/* Lightning WebGL Background */}
          <div className="absolute inset-0 z-0">
            <Lightning hue={180} xOffset={0} speed={1.2} intensity={0.5} size={2} />
            <div className="absolute inset-0 bg-black/60" /> {/* Overlay for readability */}
          </div>

          {/* Gradient orbs */}
          <div className="absolute inset-0 z-[1] pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/15 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
          </div>

          {/* Planet/Sphere decoration */}
          <div className="absolute top-[60%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle_at_25%_90%,_#1e386b_15%,_#000000de_70%,_#000000ed_100%)] blur-sm z-[2] pointer-events-none" />

          {/* Content */}
          <div className="container mx-auto px-4 relative z-10">
            <motion.div 
              className="max-w-5xl mx-auto text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={itemVariants}>
                <Badge className="mb-6 px-4 py-2 text-sm bg-primary/10 border-primary/30 hover:bg-primary/20 transition-colors">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Educational Trading Platform
                </Badge>
              </motion.div>

              <motion.h1 
                variants={itemVariants}
                className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-6 leading-[1.1]"
              >
                <span className="bg-gradient-to-r from-primary via-accent to-chart-3 bg-clip-text text-transparent">
                  SimFi
                </span>
                <br />
                <span className="text-foreground text-4xl sm:text-5xl md:text-6xl">
                  Learn Trading Risk-Free
                </span>
              </motion.h1>

              <motion.p 
                variants={itemVariants}
                className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed"
              >
                Practice trading Solana memecoins with virtual currency. Master strategies, 
                compete on leaderboards, and earn real rewards—without risking a single dollar.
              </motion.p>

              {/* Animated Search Bar */}
              <motion.div variants={itemVariants} className="mb-10">
                <AnimatedSearchBar 
                  placeholder="Search tokens to trade..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={(q) => setLocation(`/trade?search=${q}`)}
                />
              </motion.div>

              <motion.div 
                variants={itemVariants}
                className="flex flex-col sm:flex-row gap-4 justify-center items-center"
              >
                <GradientButton onClick={() => setLocation('/register')}>
                  <Rocket className="h-5 w-5" />
                  Get Started Free
                </GradientButton>

                <motion.button
                  onClick={() => setLocation('/leaderboard')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-4 rounded-full font-semibold text-lg border-2 border-border hover:border-primary/50 bg-card/50 backdrop-blur-sm transition-all flex items-center gap-2"
                >
                  <Trophy className="h-5 w-5" />
                  View Leaderboard
                </motion.button>
              </motion.div>

              {/* Stats */}
              <motion.div 
                variants={itemVariants}
                className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto"
              >
                {[
                  { value: "10 SOL", label: "Starting Balance" },
                  { value: "6h", label: "Trading Periods" },
                  { value: "Top 3", label: "Win Real SOL" },
                ].map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </div>

          {/* Scroll indicator */}
          <motion.div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="h-8 w-8 text-muted-foreground" />
          </motion.div>
        </section>

        {/* ===== FEATURES SECTION WITH GLOWING CARDS ===== */}
        <section className="py-24 relative">
          <div className="container mx-auto px-4 max-w-6xl">
            <motion.div 
              className="text-center mb-16"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <Badge className="mb-4">Features</Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4">How SimFi Works</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                Everything you need to learn trading without the financial risk
              </p>
            </motion.div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={containerVariants}
            >
              {[
                { icon: <Coins className="h-6 w-6 text-primary" />, title: "Virtual Currency", description: "Start with 10 SOL of virtual currency. Practice trading real tokens with live market prices from pump.fun." },
                { icon: <TrendingUp className="h-6 w-6 text-primary" />, title: "Real-Time Data", description: "Experience authentic market conditions with real-time price feeds and live token launches." },
                { icon: <Trophy className="h-6 w-6 text-primary" />, title: "Compete & Win", description: "Top 3 traders in each 6-hour period win real SOL rewards from our creator fee pool." },
                { icon: <BarChart3 className="h-6 w-6 text-primary" />, title: "Track Progress", description: "Monitor your portfolio, analyze your trades, and improve your strategy over time." },
                { icon: <Shield className="h-6 w-6 text-primary" />, title: "Zero Risk", description: "No real money required. Learn from mistakes without financial consequences." },
                { icon: <GraduationCap className="h-6 w-6 text-primary" />, title: "Educational Focus", description: "Build confidence, test strategies, and learn the market before trading for real." },
              ].map((feature, i) => (
                <motion.div key={i} variants={itemVariants}>
                  <FeatureCard {...feature} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ===== MISSION SECTION ===== */}
        <section className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
          <div className="container mx-auto px-4 max-w-5xl relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <Card className="p-8 md:p-12 relative overflow-hidden border-primary/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />

                <div className="relative flex flex-col md:flex-row items-start gap-6">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
                    <Heart className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h2 className="text-3xl md:text-4xl font-bold mb-6">Our Mission</h2>
                    <p className="text-lg text-muted-foreground leading-relaxed mb-4">
                      SimFi was created to provide a safe, educational environment for learning cryptocurrency trading. 
                      We believe everyone should have the opportunity to understand market dynamics and trading strategies 
                      without the fear of financial loss.
                    </p>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                      Our platform is especially valuable for those who struggle with gambling tendencies in crypto markets. 
                      By simulating real trading with virtual SOL, you can satisfy the excitement of trading while developing 
                      healthy habits and strategic thinking.
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* ===== RESPONSIBLE TRADING WARNING ===== */}
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-5xl">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <Card className="p-8 border-2 border-destructive/30 bg-destructive/5">
                <div className="flex flex-col md:flex-row items-start gap-6">
                  <div className="w-14 h-14 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-7 w-7 text-destructive" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold mb-4">For Those Struggling with Trading Addiction</h3>
                    <p className="text-muted-foreground leading-relaxed mb-6">
                      If you've experienced gambling addiction with memecoins or crypto trading, SimFi offers a healthier alternative. 
                      Experience the thrill of trading without risking your financial well-being.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { icon: Shield, title: "Zero Financial Risk", desc: "Trade with virtual SOL, never real money" },
                        { icon: Target, title: "Learn Strategy", desc: "Develop disciplined trading habits safely" },
                        { icon: TrendingUp, title: "Real Market Data", desc: "Experience authentic price movements" },
                        { icon: Users, title: "Healthy Competition", desc: "Skill-based, not spending-based" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-background/50 border border-border">
                          <item.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                          <div>
                            <strong className="text-foreground block">{item.title}</strong>
                            <span className="text-sm text-muted-foreground">{item.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* ===== REWARDS DISTRIBUTION ===== */}
        <section className="py-24 relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />
          <div className="container mx-auto px-4 max-w-6xl relative">
            <motion.div 
              className="text-center mb-16"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <Badge className="mb-4">Rewards</Badge>
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Creator Fee Distribution</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                We're committed to rewarding our community and continuously improving the platform
              </p>
            </motion.div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={containerVariants}
            >
              {/* 50% Leaderboard */}
              <motion.div variants={itemVariants}>
                <div className="relative h-full rounded-2xl border-2 border-primary/30 p-2">
                  <GlowingEffect spread={30} glow={true} disabled={false} proximity={50} inactiveZone={0.2} borderWidth={2} />
                  <Card className="p-6 h-full bg-gradient-to-br from-primary/10 to-transparent border-0">
                    <div className="flex items-center gap-3 mb-4">
                      <Trophy className="h-10 w-10 text-primary" />
                      <span className="text-5xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">50%</span>
                    </div>
                    <h4 className="font-semibold text-xl mb-4">Leaderboard Prizes</h4>
                    <div className="space-y-3">
                      {[
                        { place: "🥇 1st Place", pct: "50%" },
                        { place: "🥈 2nd Place", pct: "30%" },
                        { place: "🥉 3rd Place", pct: "20%" },
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-background/50 border border-border">
                          <span>{item.place}</span>
                          <span className="font-mono font-bold text-primary">{item.pct}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </motion.div>

              {/* 30% Development */}
              <motion.div variants={itemVariants}>
                <Card className="p-6 h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <Rocket className="h-10 w-10 text-accent" />
                    <span className="text-5xl font-bold">30%</span>
                  </div>
                  <h4 className="font-semibold text-xl mb-4">Platform Development</h4>
                  <p className="text-muted-foreground leading-relaxed">
                    Invested in better charts, improved APIs, enhanced features, and making SimFi 
                    the best educational trading tool in the space.
                  </p>
                </Card>
              </motion.div>

              {/* 20% Team */}
              <motion.div variants={itemVariants}>
                <Card className="p-6 h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <Users className="h-10 w-10 text-chart-3" />
                    <span className="text-5xl font-bold">20%</span>
                  </div>
                  <h4 className="font-semibold text-xl mb-4">Development Team</h4>
                  <p className="text-muted-foreground leading-relaxed">
                    Supports the team maintaining servers, fixing bugs, and ensuring 24/7 uptime 
                    for the best user experience.
                  </p>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* ===== COMMUNITY SECTION ===== */}
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-4xl">
            <motion.div 
              className="text-center mb-12"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <Badge className="mb-4">Community</Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Join Our Community</h2>
              <p className="text-muted-foreground">
                Connect with us on X (Twitter) for updates, tips, and discussions
              </p>
            </motion.div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={containerVariants}
            >
              {[
                { href: "https://x.com/i/communities/1981329893569835367", icon: Users, iconColor: "text-primary", bgColor: "bg-primary/10", title: "SimFi Community", desc: "Join our X community" },
                { href: "https://x.com/uncgorkh?s=21", icon: Rocket, iconColor: "text-accent", bgColor: "bg-accent/10", title: "Developer", desc: "Follow the SimFi dev" },
              ].map((link, i) => (
                <motion.a
                  key={i}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  variants={itemVariants}
                  className="block group"
                >
                  <div className="relative rounded-xl border border-border p-2">
                    <GlowingEffect spread={30} glow={true} disabled={false} proximity={40} inactiveZone={0.3} borderWidth={2} />
                    <Card className="p-6 h-full border-0 hover:bg-card/80 transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", link.bgColor)}>
                          <link.icon className={cn("h-6 w-6", link.iconColor)} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <SiX className="h-4 w-4" />
                            <span className="font-semibold">{link.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{link.desc}</p>
                        </div>
                        <ExternalLink className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </Card>
                  </div>
                </motion.a>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-t from-primary/20 to-transparent rounded-full blur-[100px]" />

          <div className="container mx-auto px-4 max-w-4xl relative">
            <motion.div 
              className="text-center"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInUp}
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Zap className="h-16 w-16 text-primary mx-auto mb-8" />
              </motion.div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to Start Learning?</h2>
              <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
                Join SimFi today and start your journey toward becoming a skilled trader—without risking a single dollar
              </p>
              <GradientButton onClick={() => setLocation('/register')}>
                <Rocket className="h-6 w-6" />
                Get Started Free
              </GradientButton>
            </motion.div>
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="border-t border-border bg-card/50 py-12">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {/* Logo & Description */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                    <span className="text-lg font-bold text-white">S</span>
                  </div>
                  <span className="text-xl font-bold">SimFi</span>
                </div>
                <p className="text-muted-foreground max-w-sm">
                  Practice trading Solana memecoins risk-free. Master strategies, compete on leaderboards, and learn without losing real money.
                </p>
              </div>

              {/* Quick Links */}
              <div>
                <h4 className="font-semibold mb-4">Quick Links</h4>
                <ul className="space-y-2">
                  {[
                    { label: 'Trade', href: '/trade' },
                    { label: 'Leaderboard', href: '/leaderboard' },
                    { label: 'Portfolio', href: '/portfolio' },
                    { label: 'About', href: '/about' },
                  ].map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-muted-foreground hover:text-primary transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Social */}
              <div>
                <h4 className="font-semibold mb-4">Follow Us</h4>
                <ul className="space-y-2">
                  <li>
                    <a 
                      href="https://x.com/i/communities/1981329893569835367" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <SiX className="h-4 w-4" />
                      X Community
                    </a>
                  </li>
                  <li>
                    <a 
                      href="https://x.com/uncgorkh?s=21" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <SiX className="h-4 w-4" />
                      Developer
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="border-t border-border mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} SimFi. Educational trading platform.</p>
              <p>No real money involved. Practice safely.</p>
            </div>
          </div>
        </footer>
      </div>
    );
  }