/**
 * Komprimiert public/videos/HeroVideo.mp4 fuer den Hero-Phone-Mockup.
 * Strategie: 540px Breite (mehr brauchts fuer den ~300px-Mockup nicht), H.264
 * CRF 26 (gute Qualitaet, deutlich kleiner), Audio raus (autoplay ist muted),
 * Faststart fuers Web-Streaming.
 *
 * Aufruf: npx tsx scripts/compress-hero-video.ts
 */
import { execSync } from "node:child_process";
import { statSync, renameSync } from "node:fs";
import * as path from "node:path";
import ffmpegStatic from "ffmpeg-static";

const ffmpegPath = ffmpegStatic as unknown as string;
if (!ffmpegPath) {
  console.error("ffmpeg-static binary nicht gefunden");
  process.exit(1);
}

const input = path.join(process.cwd(), "public/videos/HeroVideo.mp4");
const tmp   = path.join(process.cwd(), "public/videos/HeroVideo.compressed.mp4");

function fmtMB(p: string) {
  return (statSync(p).size / 1024 / 1024).toFixed(2) + " MB";
}

console.log(`📹 Input:  ${input} (${fmtMB(input)})`);
console.log("⏳ Komprimiere...\n");

const cmd = [
  `"${ffmpegPath}"`,
  "-y",                              // ueberschreiben ohne nachfragen
  "-i", `"${input}"`,
  "-an",                              // Audio raus
  "-vcodec", "libx264",
  "-crf", "26",
  "-preset", "slow",                 // bessere Compression als 'medium', dauert laenger
  "-vf", "scale=540:-2",             // Breite 540, Hoehe automatisch (gerade Zahl)
  "-movflags", "+faststart",         // Header an den Anfang fuer Streaming
  "-pix_fmt", "yuv420p",             // breite Browser-Kompatibilitaet
  `"${tmp}"`,
].join(" ");

try {
  execSync(cmd, { stdio: "inherit" });
} catch (e) {
  console.error("\n❌ ffmpeg fehlgeschlagen:", e);
  process.exit(1);
}

const before = statSync(input).size;
const after  = statSync(tmp).size;
const ratio  = (after / before) * 100;

renameSync(tmp, input);

console.log(`\n✅ Fertig:`);
console.log(`   Vorher:    ${(before / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Nachher:   ${(after  / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Reduktion: ${(100 - ratio).toFixed(1)} %`);
