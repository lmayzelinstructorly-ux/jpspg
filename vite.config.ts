import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({mode})=>{
const env=loadEnv(mode,'apps/web','VITE_');
const raw=process.env.VITE_SITE_URL||env.VITE_SITE_URL;
const origin=raw?new URL(raw).origin:'';
return {
  root: "apps/web",
  plugins: [react(),{name:'jpspg-public-metadata',transformIndexHtml(html){if(!origin)return html;return html.replace('</head>',`<link rel="canonical" href="${origin}/"/><meta property="og:url" content="${origin}/"/><meta property="og:image" content="${origin}/og.png"/><meta name="twitter:card" content="summary_large_image"/></head>`);},generateBundle(){if(origin)this.emitFile({type:'asset',fileName:'sitemap.xml',source:`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`});}}],
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber"],
          voice: ["livekit-client"],
        },
      },
    },
  },
};});
