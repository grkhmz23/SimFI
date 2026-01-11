import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useLocation } from 'wouter';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, ArrowRight, TrendingUp, Zap, Shield, BarChart3, Users, Rocket, Star, Trophy, Send, ExternalLink, Sparkles, Coins, GraduationCap, ChevronDown } from 'lucide-react';
import { SiX } from 'react-icons/si';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SearchResult {
  tokenAddress: string;
  name: string;
  symbol: string;
  icon?: string;
  marketCap?: number;
  price?: number;
}

// =============================================================================
// LIGHTNING BACKGROUND COMPONENT (WebGL)
// =============================================================================
const Lightning = memo(({ hue = 180, intensity = 0.4 }: { hue?: number; intensity?: number }) => {
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
    if (!gl) return;

    const vertexShaderSource = `attribute vec2 aPosition; void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;
    const fragmentShaderSource = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;
      uniform float uHue;
      uniform float uIntensity;
      #define OCTAVE_COUNT 10
      vec3 hsv2rgb(vec3 c) {
        vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        return c.z * mix(vec3(1.0), rgb, c.y);
      }
      float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
      float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      mat2 rotate2d(float t) { float c = cos(t), s = sin(t); return mat2(c, -s, s, c); }
      float noise(vec2 p) {
        vec2 ip = floor(p), fp = fract(p);
        float a = hash12(ip), b = hash12(ip + vec2(1.0, 0.0)), c = hash12(ip + vec2(0.0, 1.0)), d = hash12(ip + vec2(1.0, 1.0));
        vec2 t = smoothstep(0.0, 1.0, fp);
        return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
      }
      float fbm(vec2 p) {
        float value = 0.0, amplitude = 0.5;
        for (int i = 0; i < OCTAVE_COUNT; ++i) { value += amplitude * noise(p); p *= rotate2d(0.45); p *= 2.0; amplitude *= 0.5; }
        return value;
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / iResolution.xy;
        uv = 2.0 * uv - 1.0;
        uv.x *= iResolution.x / iResolution.y;
        uv += 2.0 * fbm(uv * 2.0 + 0.8 * iTime * 1.2) - 1.0;
        float dist = abs(uv.x);
        vec3 baseColor = hsv2rgb(vec3(uHue / 360.0, 0.7, 0.8));
        vec3 col = baseColor * pow(mix(0.0, 0.07, hash11(iTime * 1.2)) / dist, 1.0) * uIntensity;
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const compileShader = (source: string, type: number) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };

    const vs = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fs = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const iRes = gl.getUniformLocation(program, "iResolution");
    const iTime = gl.getUniformLocation(program, "iTime");
    const uHue = gl.getUniformLocation(program, "uHue");
    const uInt = gl.getUniformLocation(program, "uIntensity");

    const start = performance.now();
    let animId: number;
    const render = () => {
      resizeCanvas();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(iRes, canvas.width, canvas.height);
      gl.uniform1f(iTime, (performance.now() - start) / 1000);
      gl.uniform1f(uHue, hue);
      gl.uniform1f(uInt, intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);

    return () => { window.removeEventListener("resize", resizeCanvas); cancelAnimationFrame(animId); };
  }, [hue, intensity]);

  return <canvas ref={canvasRef} className="w-full h-full absolute inset-0" />;
});

// =============================================================================
// ANIMATED SEARCH BAR
// =============================================================================
const AnimatedSearchBar = ({ 
  value, 
  onChange, 
  placeholder,
  isLoading 
}: { 
  value: string; 
  onChange: (v: string) => void; 
  placeholder?: string;
  isLoading?: boolean;
}) => {
  return (
    <div className="relative flex items-center justify-center w-full max-w-2xl mx-auto">
      <div className="relative flex items-center justify-center group w-full">
        {/* Glow layers */}
        <div className="absolute z-[-1] overflow-hidden h-full w-full rounded-full blur-[3px] 
          before:absolute before:content-[''] before:z-[-2] before:w-[999px] before:h-[999px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[60deg]
          before:bg-[conic-gradient(#000,#402fb5_5%,#000_38%,#000_50%,#cf30aa_60%,#000_87%)] before:transition-all before:duration-[2000ms]
          group-hover:before:rotate-[-120deg] group-focus-within:before:rotate-[420deg] group-focus-within:before:duration-[4000ms]" />
        <div className="absolute z-[-1] overflow-hidden h-full w-full rounded-full blur-[2px] 
          before:absolute before:content-[''] before:z-[-2] before:w-[600px] before:h-[600px] before:bg-no-repeat before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rotate-[83deg]
          before:bg-[conic-gradient(rgba(0,0,0,0)_0%,#a099d8,rgba(0,0,0,0)_8%,rgba(0,0,0,0)_50%,#dfa2da,rgba(0,0,0,0)_58%)]
          before:transition-all before:duration-[2000ms] group-hover:before:rotate-[-97deg] group-focus-within:before:rotate-[443deg] group-focus-within:before:duration-[4000ms]" />

        {/* Input */}
        <div className="relative w-full">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
          <input 
            placeholder={placeholder || "Search tokens..."}
            type="text" 
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-card/90 backdrop-blur-sm border-2 border-border/50 w-full h-14 rounded-full text-foreground pl-14 pr-14 text-base focus:outline-none focus:border-primary/50 placeholder-muted-foreground transition-all" 
          />
          {isLoading && (
            <Loader2 className="absolute right-5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary animate-spin" />
          )}
          <div className="pointer-events-none w-[30px] h-[20px] absolute bg-[#cf30aa] top-[10px] left-[5px] blur-2xl opacity-60 transition-all duration-[2000ms] group-hover:opacity-0 rounded-full" />
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// GRADIENT BUTTON
// =============================================================================
const GradientButton = ({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) => (
  <motion.button
    onClick={onClick}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    className={cn(
      "relative px-8 py-4 rounded-full font-semibold text-lg overflow-hidden",
      "bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_100%]",
      "hover:bg-[position:100%_0] transition-all duration-500",
      "text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40",
      className
    )}
  >
    <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
  </motion.button>
);

// =============================================================================
// FEATURE CARD WITH GLOW
// =============================================================================
const FeatureCard = ({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) => (
  <motion.div 
    className="group relative"
    whileHover={{ y: -5 }}
    transition={{ duration: 0.2 }}
  >
    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-accent to-primary rounded-2xl blur opacity-0 group-hover:opacity-30 transition duration-500" />
    <Card className="relative h-full p-6 bg-card border-border hover:border-primary/50 transition-all duration-300">
      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Card>
  </motion.div>
);

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
};

const itemVariants = {
  hidden: { y: 30, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }
};

export default function Trade() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isLoading: isSearching } = useQuery<{ results: SearchResult[] }>({
    queryKey: ['/api/market/search', debouncedQuery],
    queryFn: async () => {
      const response = await fetch(`/api/market/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!response.ok) throw new Error('Search failed');
      return response.json();
    },
    enabled: debouncedQuery.length >= 3,
    staleTime: 30000,
  });

  const handleTokenClick = (address: string) => setLocation(`/token/${address}`);

  const hasSearchResults = searchResults && searchResults.results.length > 0;
  const showSearchResults = debouncedQuery.length >= 3;

  return (
    <div className="min-h-screen bg-background">
      {/* ===== HERO SECTION WITH LIGHTNING ===== */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Lightning Background */}
        <div className="absolute inset-0 z-0">
          <Lightning hue={180} intensity={0.35} />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        {/* Gradient orbs */}
        <div className="absolute inset-0 z-[1] pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-primary/15 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-accent/15 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Planet decoration */}
        <div className="absolute top-[65%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle_at_25%_90%,_#1e386b_15%,_#000000de_70%,_#000000ed_100%)] blur-sm z-[2] pointer-events-none hidden md:block" />

        {/* Content */}
        <div className="container mx-auto px-4 relative z-10">
          <motion.div 
            className="max-w-4xl mx-auto text-center"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={itemVariants}>
              <Badge className="mb-6 px-4 py-2 text-sm bg-primary/10 border-primary/30">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                Live Paper Trading
              </Badge>
            </motion.div>

            <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-primary via-accent to-chart-3 bg-clip-text text-transparent">
                SimFi
              </span>
              <br />
              <span className="text-foreground text-4xl md:text-5xl">Risk-Free DeFi Trading</span>
            </motion.h1>

            <motion.p variants={itemVariants} className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Practice trading Solana memecoins with virtual SOL. Master your strategy, compete on leaderboards, and win real rewards.
            </motion.p>

            {/* Animated Search Bar */}
            <motion.div variants={itemVariants} className="mb-8">
              <p className="text-sm text-muted-foreground mb-3">
                Enter a token contract address or name to start trading
              </p>
              <AnimatedSearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search tokens by name or address..."
                isLoading={isSearching}
              />
            </motion.div>

            {/* Search Results */}
            {showSearchResults && (
              <motion.div 
                className="max-w-2xl mx-auto mb-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {isSearching ? (
                  <Card className="p-8 text-center bg-card/90 backdrop-blur">
                    <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin mb-2" />
                    <p className="text-sm text-muted-foreground">Searching tokens...</p>
                  </Card>
                ) : hasSearchResults ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {searchResults.results.map((result, index) => (
                      <motion.div
                        key={result.tokenAddress}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card
                          className="p-4 cursor-pointer bg-card/90 backdrop-blur hover:bg-card hover:border-primary/50 transition-all"
                          onClick={() => handleTokenClick(result.tokenAddress)}
                        >
                          <div className="flex items-center gap-3">
                            {result.icon && (
                              <img src={result.icon} alt={result.name} className="w-10 h-10 rounded-full ring-2 ring-border" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            <div className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold truncate">{result.name}</span>
                                <Badge variant="outline" className="text-xs">{result.symbol}</Badge>
                              </div>
                              <p className="text-xs font-mono text-muted-foreground truncate">{result.tokenAddress}</p>
                              {result.marketCap !== undefined && result.marketCap > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  <TrendingUp className="h-3 w-3 text-green-500" />
                                  <span className="text-sm font-semibold text-green-500">
                                    ${result.marketCap >= 1_000_000 ? `${(result.marketCap / 1_000_000).toFixed(2)}M` : result.marketCap >= 1_000 ? `${(result.marketCap / 1_000).toFixed(1)}K` : result.marketCap.toFixed(0)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <ArrowRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <Card className="p-8 text-center bg-card/90 backdrop-blur">
                    <Search className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No tokens found for "{debouncedQuery}"</p>
                  </Card>
                )}
              </motion.div>
            )}

            {/* CTAs */}
            {!isAuthenticated && !showSearchResults && (
              <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <GradientButton onClick={() => setLocation('/register')}>
                  <Rocket className="h-5 w-5" />
                  Get Started Free
                </GradientButton>
                <motion.button
                  onClick={() => setLocation('/about')}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-4 rounded-full font-semibold border-2 border-border hover:border-primary/50 bg-card/50 backdrop-blur transition-all flex items-center gap-2"
                >
                  Learn More
                  <ArrowRight className="h-5 w-5" />
                </motion.button>
              </motion.div>
            )}

            {/* Stats */}
            {!showSearchResults && (
              <motion.div variants={itemVariants} className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto">
                {[
                  { value: "10 SOL", label: "Starting Balance" },
                  { value: "6h", label: "Trading Periods" },
                  { value: "Real SOL", label: "Prizes" },
                ].map((stat, i) => (
                  <div key={i} className="text-center">
                    <div className="text-2xl md:text-3xl font-bold text-primary">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Scroll indicator */}
        {!showSearchResults && (
          <motion.div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="h-8 w-8 text-muted-foreground" />
          </motion.div>
        )}
      </section>

      {/* ===== FEATURES SECTION ===== */}
      <section className="py-20 relative">
        <div className="container mx-auto px-4 max-w-6xl">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge className="mb-4">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Why Trade on SimFi?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The safest way to learn crypto trading
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
              { icon: <Coins className="h-6 w-6 text-primary" />, title: "Virtual Currency", description: "Start with 10 SOL of virtual currency. No real money at risk." },
              { icon: <TrendingUp className="h-6 w-6 text-primary" />, title: "Real-Time Prices", description: "Trade real tokens with live market data from pump.fun." },
              { icon: <Trophy className="h-6 w-6 text-primary" />, title: "Win Real SOL", description: "Top 3 traders every 6 hours win real SOL rewards." },
              { icon: <Shield className="h-6 w-6 text-primary" />, title: "Zero Risk", description: "Learn from mistakes without financial consequences." },
              { icon: <BarChart3 className="h-6 w-6 text-primary" />, title: "Track Progress", description: "Monitor your portfolio and improve your strategy." },
              { icon: <GraduationCap className="h-6 w-6 text-primary" />, title: "Learn Trading", description: "Build confidence before trading with real money." },
            ].map((feature, i) => (
              <motion.div key={i} variants={itemVariants}>
                <FeatureCard {...feature} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ===== CTA SECTION ===== */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 max-w-4xl relative">
          <motion.div 
            className="text-center"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Sparkles className="h-12 w-12 text-primary mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Start Trading?</h2>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Join SimFi today and start your journey to becoming a skilled trader
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <GradientButton onClick={() => setLocation('/register')}>
                <Rocket className="h-5 w-5" />
                Get Started Free
              </GradientButton>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setLocation('/leaderboard')}
                className="gap-2"
              >
                <Trophy className="h-5 w-5" />
                View Leaderboard
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <span className="text-sm font-bold text-white">S</span>
              </div>
              <span className="font-semibold text-foreground">SimFi</span>
            </div>
            <p>© {new Date().getFullYear()} SimFi. Educational trading platform. No real money involved.</p>
            <div className="flex items-center gap-4">
              <a href="https://x.com/i/communities/1981329893569835367" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                <SiX className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
