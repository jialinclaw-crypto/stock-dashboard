/** Build the vendored stylesheet:
 *    npm i -D tailwindcss@3.4.17
 *    npx tailwindcss -i input.css -o assets/tailwind.css --minify
 *  Replaces the old runtime Play CDN (which caused flash-of-unstyled-content). */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './assets/app.js', './assets/live-prices.js'],
  theme: {
    extend: {
      colors: {
        bg:   { DEFAULT: '#080b14', light: '#f5f7fb' },
        card: { DEFAULT: '#111827', light: '#ffffff' },
        accent: { DEFAULT: '#10b981', red: '#ef4444' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Noto Sans TC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
    },
  },
  safelist: [
    'text-emerald-400','text-rose-400','text-amber-300','text-amber-400','text-slate-300','text-slate-400','text-slate-500',
    'bg-emerald-500/20','bg-amber-500/20','bg-rose-500/20','bg-slate-700','bg-slate-800',
    'text-emerald-300','text-amber-200','text-rose-300','text-emerald-200','text-rose-200',
    'price-flash','hidden',
    'border-emerald-500/40','border-amber-500/40','border-rose-500/40','border-slate-700','border-slate-600/40',
    'bg-emerald-500/5','bg-amber-500/5','bg-rose-500/5','bg-slate-700/10',
  ],
}
