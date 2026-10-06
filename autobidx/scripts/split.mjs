// Dev tool: split a tall screenshot into viewport-sized parts (halved). Usage: node scripts/split.mjs file.png [partHeight]
import sharp from "sharp";
const [file, ph = "1800"] = process.argv.slice(2);
const meta = await sharp(file).metadata();
const step = Number(ph);
for (let y = 0, i = 0; y < meta.height; y += step, i++) {
  const h = Math.min(step, meta.height - y);
  await sharp(file).extract({ left: 0, top: y, width: meta.width, height: h }).resize(Math.round(meta.width / 2)).toFile(file.replace(".png", `_p${i}.png`));
}
console.log(meta.width, meta.height);
