/** @type {import('tailwindcss').Config} */
export default {
  content: ['./resources/views/**/*.blade.php', './resources/js/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        // Paleta "Mi Gallinero" — ámbar/granja + verde + rojo para alertas
        brand: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        grass: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#16a34a',
          600: '#15803d',
          700: '#166534',
        },
        alert: {
          50: '#fef2f2',
          500: '#dc2626',
          600: '#b91c1c',
          700: '#991b1b',
        },
      },
      fontFamily: {
        // Pila del sistema: se ve nativa en cada plataforma, no requiere ninguna
        // descarga y funciona sin conexión. Antes dependía de Inter servida desde
        // Google Fonts, que en una PWA offline simplemente no cargaba.
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Noto Sans',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // Tamaños grandes para adultos mayores
        'mega': ['3.5rem', { lineHeight: '1.1' }], // 56px — números resumen
        'huge': ['2.25rem', { lineHeight: '1.15' }], // 36px — títulos
      },
      borderRadius: {
        'xl2': '1.25rem', // esquinas redondeadas tipo iOS
      },
      spacing: {
        '18': '4.5rem',
      },
      minWidth: {
        'touch': '4rem', // 64px — botones táctiles aptos para dedos
      },
      minHeight: {
        'touch': '4rem',
      },
    },
  },
  plugins: [],
}
