// Dev tool: renders a contact sheet of the procedural vehicle art. Usage: npx tsx scripts/preview-car-art.ts out.jpg
import sharp from "sharp";
import { carSceneSvg, interiorSvg, wheelDetailSvg } from "../src/lib/car-art";
const out = process.argv[2];
const kinds = ["HATCHBACK","SEDAN","SUV","MUV","COUPE","PICKUP","COMMERCIAL","CONVERTIBLE"] as const;
const scenes = ["studio","showroom","dusk","coastal"] as const;
const colors = ["#e9ecef","#b3202a","#1f4fa3","#22252a","#1e7a80","#b89a63","#5d636b","#d9661f"];
(async () => {
  const tiles: Buffer[] = [];
  for (let i = 0; i < 8; i++) {
    const svg = carSceneSvg({ kind: kinds[i], color: colors[i], scene: scenes[i % 4], seed: 1000 + i * 37 });
    tiles.push(await sharp(Buffer.from(svg)).resize(640, 480).png().toBuffer());
  }
  tiles.push(await sharp(Buffer.from(interiorSvg({ seed: 3, trim: "beige", accent: "#4cc3ff" }))).resize(640, 480).png().toBuffer());
  tiles.push(await sharp(Buffer.from(wheelDetailSvg({ color: "#b3202a", seed: 4 }))).resize(640, 480).png().toBuffer());
  const comp = sharp({ create: { width: 640 * 4, height: 480 * 3, channels: 3, background: "#fff" } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 4) * 640, top: Math.floor(i / 4) * 480 })));
  await comp.jpeg({ quality: 80 }).toFile(out);
})();
