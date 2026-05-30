import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "media",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      boxShadow: {
        planner: "0 18px 45px rgba(27, 31, 35, 0.10)",
        "planner-soft": "0 10px 26px rgba(27, 31, 35, 0.08)",
      },
      colors: {
        ink: {
          DEFAULT: "#1f2937",
          soft: "#4b5563",
        },
        paper: {
          DEFAULT: "#fbfaf7",
          line: "#e8e2d6",
        },
        mint: {
          500: "#28a879",
          600: "#18815f",
        },
        coral: {
          500: "#e46d5c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
