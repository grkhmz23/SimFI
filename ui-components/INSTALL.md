# SimFi UI Modernization - Installation Guide

## Files to Copy

### 1. UI Components (copy to `client/src/components/ui/`)
- `glowing-effect.tsx` - Interactive glowing border effect
- `gradient-button.tsx` - Animated gradient button
- `animated-search-bar.tsx` - Fancy search bar with glow effects
- `footer.tsx` - Modern footer component

### 2. Page (copy to `client/src/pages/`)
- `About.tsx` - Modernized landing page

### 3. CSS (add to `client/src/index.css`)
- Add contents of `additional-styles.css` to your existing `index.css`

## Installation Steps

### Step 1: Copy component files
```bash
# In your Replit shell
cp glowing-effect.tsx client/src/components/ui/
cp gradient-button.tsx client/src/components/ui/
cp animated-search-bar.tsx client/src/components/ui/
cp footer.tsx client/src/components/ui/
cp About.tsx client/src/pages/
```

### Step 2: Add CSS to index.css
Append the contents of `additional-styles.css` to the end of your `client/src/index.css` file.

### Step 3: Verify framer-motion is installed
```bash
npm list framer-motion
```

If not installed:
```bash
npm install framer-motion
```

### Step 4: Restart the app
```bash
pkill -f node
npm install --include=dev && npm run dev
```

## Component Usage

### GradientButton
```tsx
import { GradientButton } from '@/components/ui/gradient-button';

<GradientButton
  onClick={() => console.log('clicked')}
  width="200px"
  height="50px"
>
  <Rocket className="h-5 w-5" />
  Get Started
</GradientButton>
```

### GlowingEffect (for cards)
```tsx
import { GlowingEffect } from '@/components/ui/glowing-effect';

<div className="relative rounded-xl border p-6">
  <GlowingEffect
    spread={40}
    glow={true}
    disabled={false}
    proximity={64}
    inactiveZone={0.01}
    borderWidth={3}
  />
  <div className="relative">
    {/* Your content */}
  </div>
</div>
```

### AnimatedSearchBar
```tsx
import { AnimatedSearchBar } from '@/components/ui/animated-search-bar';

<AnimatedSearchBar
  placeholder="Search tokens..."
  onChange={(value) => setSearch(value)}
  onSearch={(value) => handleSearch(value)}
  showFilter={true}
/>
```

### Footer
```tsx
import { Footer } from '@/components/ui/footer';

<Footer
  companyName="SimFi"
  description="Your description here"
  usefulLinks={[
    { label: 'Trade', href: '/trade' },
    { label: 'About', href: '/about' },
  ]}
  socialLinks={[
    { label: 'Twitter', href: 'https://...', icon: <TwitterIcon /> },
  ]}
/>
```

## Notes

1. The GlowingEffect component uses CSS animations and doesn't require the `motion` library
2. The GradientButton uses CSS @property for smooth gradient rotation (with fallback for older browsers)
3. The About page uses framer-motion for scroll animations
4. All components follow your existing dark theme and color scheme
