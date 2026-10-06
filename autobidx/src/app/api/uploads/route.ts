import { route } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { AppError } from "@/lib/errors";
import { storeUpload, type UploadKind } from "@/server/storage/upload";

const PURPOSES: Record<string, { kind: UploadKind[]; public: boolean }> = {
  "vehicle-image": { kind: ["image", "video"], public: true },
  "vehicle-doc": { kind: ["document"], public: false },
  kyc: { kind: ["document"], public: false },
  "order-doc": { kind: ["document"], public: false },
  dispute: { kind: ["document"], public: false },
};

export const POST = route(
  async ({ req, actor }) => {
    const a = requireActor(actor);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > 120 * 1024 * 1024) throw new AppError("VALIDATION", "File is too large.");
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new AppError("BAD_REQUEST", "Upload a file using multipart/form-data.");
    }
    const file = form.get("file");
    const purpose = String(form.get("purpose") ?? "");
    const kind = String(form.get("kind") ?? "image") as UploadKind;
    const cfg = PURPOSES[purpose];
    if (!cfg || !cfg.kind.includes(kind)) throw new AppError("VALIDATION", "Unsupported upload type.");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Choose a file to upload.");
    if ((purpose === "vehicle-image" || purpose === "vehicle-doc") && !a.dealer && !a.permissions.has("vehicles.manage"))
      throw new AppError("FORBIDDEN", "Only dealers can upload vehicle media.");
    const data = Buffer.from(await file.arrayBuffer());
    const stored = await storeUpload({ data, kind, ownerId: a.userId, purpose, originalName: file.name, isPublic: cfg.public });
    return stored;
  },
  { rate: [60, 60], rateKey: "upload" },
);
