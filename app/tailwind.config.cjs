/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/stories/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        brand: '#2351DC',
        tertiary: '#7A7B9A',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'city': 'url("/assets/city_vector_onboarding.svg")',
        'roads': 'url("/assets/path_vector_login.svg")',
      },
      dropShadow: {
        '3xl': '0 35px 35px rgba(0, 0, 0, 0.25)',
        '4xl': [
          '0 35px 35px rgba(0, 0, 0, 0.25)',
          '0 45px 65px rgba(0, 0, 0, 0.15)'
        ],
        'top': [
          '0px -1px 2px -1px rgba(0, 0, 0, 0.10)',
          '0px -1px 3px 0px rgba(0, 0, 31, 0.10)'
        ],
      }
    },
  },
  plugins: [],
}
