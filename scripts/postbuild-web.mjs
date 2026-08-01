#!/usr/bin/env node
// Injects the PWA tags into dist/index.html after `expo export`.
//
// Why this exists: app.json uses web.output "single" (SPA — required so
// /place/<id> deep links work on static hosts with one redirect rule), and
// in single mode expo-router ignores app/+html.tsx, so there is no other
// way to get the manifest link into the exported HTML. Run automatically
// by `npm run build:web` and the Netlify build command.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const htmlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "index.html",
);

let html = readFileSync(htmlPath, "utf8");

if (html.includes('rel="manifest"')) {
  console.log("PWA tags already present — nothing to do.");
  process.exit(0);
}

const tags = [
  '<meta name="description" content="Find the nearest masjid or prayer space — facilities, jamaat times, and accurate prayer times. No account, no tracking." />',
  '<meta name="theme-color" content="#2E7D57" />',
  '<link rel="manifest" href="/manifest.json" />',
  '<link rel="icon" type="image/png" href="/icon-192.png" />',
  '<link rel="apple-touch-icon" href="/icon-192.png" />',
  // Match the app's dark surface behind the root element, so overscroll
  // and load flashes aren't white in dark mode.
  "<style>@media (prefers-color-scheme: dark){body{background-color:#141312}}</style>",
].join("\n    ");

if (!html.includes("</head>")) {
  console.error("dist/index.html has no </head> — did the export change shape?");
  process.exit(1);
}
html = html.replace("</head>", `    ${tags}\n  </head>`);

writeFileSync(htmlPath, html);
console.log("Injected PWA manifest + icon tags into dist/index.html");
