"use client";

import { useState } from "react";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PaymentForm } from "@/components/dashboard/payment-form";

export function PayChargeButton({ id, purpose, amount, methods }: { id: string; purpose: "LISTING_FEE" | "AUCTION_FEE"; amount: number; methods: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Pay {formatINR(amount)}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Pay platform charge">
        <PaymentForm target={{ purpose, targetId: id }} methods={methods} amount={amount} />
      </Modal>
    </>
  );
}
