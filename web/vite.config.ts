// Configuration de Vite (outil qui compile l'interface React).
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // En développement (pnpm web:dev, port 5173), les appels au serveur d'Awé
    // sont redirigés vers lui (port 3000).
    proxy: {
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000",
    },
  },
});
