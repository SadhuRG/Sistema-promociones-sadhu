import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";

const transformJsxInJs = () => ({
  name: "transform-jsx-in-js",
  enforce: "pre",
  async transform(code, id) {
    if (!/src[\\/].*\.js$/.test(id)) {
      return null;
    }

    return transformWithOxc(code, id, {
      lang: "jsx",
    });
  },
});

export default defineConfig({
  plugins: [
    transformJsxInJs(),
    react({
      include: /\.(js|jsx|ts|tsx)$/,
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
  },
});
