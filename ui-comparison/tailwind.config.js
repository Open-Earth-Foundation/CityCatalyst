/** @type {import('tailwindcss').Config} */
module.exports = {
  plugins: [require('daisyui')],
  important: true,
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/stories/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  darkMode: ['class', '[data-mode="dark"]'],
  /*theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },*/
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-poppins)'],
      },
    },
  },
  daisyui: {
    theme: [],
  }
}
