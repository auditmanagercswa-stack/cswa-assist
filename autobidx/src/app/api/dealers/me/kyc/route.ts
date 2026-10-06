import { route, parseJson } from "@/server/http";
import { requireActor } from "@/server/auth/rbac";
import { kycSchema } from "@/lib/validation";
import { getMyKyc, saveKyc } from "@/server/services/dealers";

export const GET = route(async ({ actor }) => {
  const { kyc, dealer, required } = await getMyKyc(requireActor(actor));
  return {
    dealer: { status: dealer.status, statusReason: dealer.statusReason, name: dealer.name, gstin: dealer.gstin, pan: dealer.pan },
    required,
    kyc: kyc && {
      status: kyc.status,
      bankAccountName: kyc.bankAccountName,
      bankAccountLast4: kyc.bankAccountLast4,
      bankIfsc: kyc.bankIfsc,
      bankName: kyc.bankName,
      authorizedName: kyc.authorizedName,
      authorizedDesignation: kyc.authorizedDesignation,
      authorizedPan: kyc.authorizedPan,
      authorizedPhone: kyc.authorizedPhone,
      reviewNotes: kyc.reviewNotes,
      documents: kyc.documents.map((d) => ({ type: d.type, fileId: d.fileId, verified: d.verified, name: d.file.originalName, mime: d.file.mime })),
    },
  };
});

export const PUT = route(async ({ req, actor, ip }) => {
  const input = await parseJson(req, kycSchema);
  await saveKyc(actor, input, ip);
  return { ok: true };
});
