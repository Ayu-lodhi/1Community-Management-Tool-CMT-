/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'bounce-in': 'bounceIn 0.5s cubic-bezier(0.36,0.07,0.19,0.97)'
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        bounceIn: {
          '0%': { transform: 'scale(0.8)', opacity: 0 },
          '60%': { transform: 'scale(1.05)', opacity: 1 },
          '100%': { transform: 'scale(1)' }
        }
      }
    }
  },
  plugins: []
}
