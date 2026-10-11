// Runs during `npm run vercel-build`. Loads the demo company only when SEED_DEMO=true.
// The seed WIPES the database, so set SEED_DEMO for the first deploy and remove it afterwards.
import { execSync } from "node:child_process";
if (process.env.SEED_DEMO === "true") {
  console.log("SEED_DEMO=true → loading demo company (this resets the database)");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
} else {
  console.log("Skipping demo seed (set SEED_DEMO=true to load it)");
}
