import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			text: 'oklch(22.06% 0.011 73.33)',
  			background: {
  				'50': 'oklch(16.04% 0.007 78.07)',
  				'100': 'oklch(22.15% 0.014 72.09)',
  				'200': 'oklch(32.87% 0.022 66.92)',
  				'300': 'oklch(43.08% 0.032 68.62)',
  				'400': 'oklch(52.41% 0.039 66.79)',
  				'500': 'oklch(61.63% 0.048 67.84)',
  				'600': 'oklch(69.51% 0.037 67.15)',
  				'700': 'oklch(77.50% 0.028 69.20)',
  				'800': 'oklch(85.05% 0.018 67.59)',
  				'900': 'oklch(92.72% 0.010 72.66)',
  				'950': 'oklch(96.29% 0.004 56.37)'
  			},
  			primary: {
  				'50': 'oklch(14.61% 0.033 27.06)',
  				'100': 'oklch(20.39% 0.057 28.63)',
  				'200': 'oklch(30.72% 0.101 28.64)',
  				'300': 'oklch(40.44% 0.139 29.19)',
  				'400': 'oklch(49.38% 0.175 28.96)',
  				'500': 'oklch(58.19% 0.208 29.21)',
  				'600': 'oklch(64.08% 0.173 26.81)',
  				'700': 'oklch(72.05% 0.128 25.39)',
  				'800': 'oklch(80.83% 0.082 23.69)',
  				'900': 'oklch(90.37% 0.038 23.86)',
  				'950': 'oklch(95.03% 0.019 21.57)'
  			},
  			secondary: {
  				'50': 'oklch(16.84% 0.025 69.34)',
  				'100': 'oklch(23.70% 0.042 65.06)',
  				'200': 'oklch(35.99% 0.073 61.20)',
  				'300': 'oklch(47.52% 0.100 60.72)',
  				'400': 'oklch(58.08% 0.124 59.85)',
  				'500': 'oklch(68.47% 0.149 59.74)',
  				'600': 'oklch(74.15% 0.125 63.70)',
  				'700': 'oklch(80.48% 0.097 66.24)',
  				'800': 'oklch(86.77% 0.064 66.81)',
  				'900': 'oklch(93.43% 0.032 68.93)',
  				'950': 'oklch(96.57% 0.015 67.64)'
  			},
  			accent: {
  				'50': 'oklch(16.21% 0.009 168.92)',
  				'100': 'oklch(22.68% 0.018 165.08)',
  				'200': 'oklch(34.16% 0.034 162.18)',
  				'300': 'oklch(44.77% 0.047 162.72)',
  				'400': 'oklch(54.55% 0.057 161.97)',
  				'500': 'oklch(64.13% 0.069 162.34)',
  				'600': 'oklch(71.42% 0.055 162.94)',
  				'700': 'oklch(78.83% 0.042 164.43)',
  				'800': 'oklch(85.96% 0.028 164.26)',
  				'900': 'oklch(93.04% 0.013 167.16)',
  				'950': 'oklch(96.55% 0.007 160.08)'
  			}
  		},
  		fontSize: {
  			sm: '0.750rem',
  			base: '1rem',
  			xl: '1.333rem',
  			'2xl': '1.777rem',
  			'3xl': '2.369rem',
  			'4xl': '3.158rem',
  			'5xl': '4.210rem'
  		},
  		fontFamily: {
  			heading: 'Quicksand',
  			body: 'Plus Jakarta Sans'
  		},
  		fontWeight: {
  			normal: '400',
  			bold: '700'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
