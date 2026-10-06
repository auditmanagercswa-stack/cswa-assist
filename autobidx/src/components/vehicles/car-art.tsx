import { carSceneSvg, type BodyKind, type Scene } from "@/lib/car-art";

/** Inline brand illustration (generated server-side from trusted, static parameters). */
export function CarArt({ kind, color, scene, seed, className }: { kind: BodyKind; color: string; scene: Scene; seed: number; className?: string }) {
  const svg = carSceneSvg({ kind, color, scene, seed, width: 1600, height: 1000, id: `hero${seed}` }).replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block" ');
  return <div className={className} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />;
}
