import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';
import dotenv from "dotenv";
dotenv.config();

// https://vite.dev/config/
export default defineConfig({

  define: {
    "env": process.env, // Include environment variables
  },
  server: {
    https: {
      key: fs.readFileSync('./localhost-key.pem'),
      cert: fs.readFileSync('./localhost.pem'),
    },
  },
  preview: {
    https: {
      key: fs.readFileSync('./localhost-key.pem'),
      cert: fs.readFileSync('./localhost.pem'),
    },
  },
  plugins: [react()],
})
