/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdb,mdx,obs,ts,tsx,vue}"],
  theme: {
    extend: {
      fontFamily: {
        // 既存の --font-family 変数を Tailwind の 'font-patient' クラスとして登録
        patient: ["var(--font-family)"],
      },
      boxShadow: {
        // 既存の --box-shadow 変数を Tailwind の 'shadow-patient' クラスとして登録
        patient: "var(--box-shadow)",
      },
      fontSize: {
        // clamp や calc を用いた独自サイズを登録
        "p-body": "var(--body)",
        "p-h1": "var(--heading1)",
        "p-h2": "var(--heading2)",
        "p-h3": "var(--heading3)",
        "p-h4": "var(--heading4)",
        "p-small": "var(--small)",
      },
      spacing: {
        // 独自の余白サイズを登録
        "p-line": "var(--space-line)",
        "p-half": "var(--half)",
      },
    },
  },
  plugins: [],
};
