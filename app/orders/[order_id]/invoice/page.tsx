"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";
import { formatCurrency } from "@/lib/payments/thresholds";
import { useTenant } from "@/lib/tenant/context";

interface Payment {
  id: string;
  method: "stripe" | "ach" | "wire";
  amount: number;
  status: "pending" | "pending_verification" | "paid" | "failed" | "canceled";
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  deposit_amount: number;
  balance_due: number;
  currency: string;
  status: string;
  recommended_payment_method: "stripe" | "ach_wire" | "hybrid";
  payment_threshold_band: "small" | "hybrid" | "large" | "enterprise";
  card_enabled: boolean;
  bank_name: string | null;
  bank_routing: string | null;
  bank_account: string | null;
  bank_swift: string | null;
  bank_beneficiary: string | null;
  payments: Payment[];
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:                 { label: "Draft",               color: "text-brand-muted bg-brand-surface border-brand-border" },
  sent:                  { label: "Awaiting Payment",    color: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
  pending_payment:       { label: "Awaiting Payment",    color: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
  pending_verification:  { label: "Transfer Received — Pending Verification", color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  partially_paid:        { label: "Deposit Paid",        color: "text-brand-primary bg-brand-primary/10 border-brand-primary/30" },
  paid:                  { label: "Paid in Full",        color: "text-green-400 bg-green-400/10 border-green-400/30" },
  failed:                { label: "Payment Failed",      color: "text-red-400 bg-red-900/20 border-red-400/30" },
  canceled:              { label: "Canceled",            color: "text-brand-muted bg-brand-surface border-brand-border" },
};

function InvoicePageContent() {
  const { order_id } = useParams<{ order_id: string }>();
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const tenant        = useTenant();
  const supabase      = createClient();

  const [invoice, setInvoice]         = useState<Invoice | null>(null);
  const [orderName, setOrderName]     = useState("");
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<"card" | "ach">("card");
  const [achMethod, setAchMethod]     = useState<"ach" | "wire">("ach");
  const [payDeposit, setPayDeposit]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [achSent, setAchSent]         = useState(false);
  const [flashMsg, setFlashMsg]       = useState<{ type: "success" | "error"; text: string } | null>(null);

  const paymentResult = searchParams.get("payment");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      // Get invoice for this order
      const res = await fetch(`/api/invoices?order_id=${order_id}`);
      if (!res.ok) { setLoading(false); return; }
      const { invoices } = await res.json() as { invoices: Invoice[] };

      // Get the most recent non-canceled invoice
      const active = (invoices ?? []).find((i) => i.status !== "canceled");
      if (!active) { setLoading(false); return; }

      setInvoice(active);

      // Pre-select tab based on recommendation
      if (active.recommended_payment_method === "ach_wire") {
        setActiveTab("ach");
      } else if (active.recommended_payment_method === "stripe" && active.card_enabled) {
        setActiveTab("card");
      }

      // Get order/client name for display
      const orderRes = await fetch(`/api/orders/${order_id}`).catch(() => null);
      if (orderRes?.ok) {
        const { order } = await orderRes.json().catch(() => ({}));
        if (order?.client?.name) setOrderName(order.client.name);
      }

      setLoading(false);
    }
    load();
  }, [order_id, supabase, router]);

  // Handle Stripe redirect result
  useEffect(() => {
    if (paymentResult === "success") {
      setFlashMsg({ type: "success", text: "Payment received. Your order will continue to production." });
      // Refresh invoice
      fetch(`/api/invoices?order_id=${order_id}`)
        .then((r) => r.json())
        .then(({ invoices }) => {
          const active = (invoices ?? []).find((i: Invoice) => i.status !== "canceled");
          if (active) setInvoice(active);
        })
        .catch(() => {});
    } else if (paymentResult === "canceled") {
      setFlashMsg({ type: "error", text: "Payment was not completed. You can try again below." });
    }
  }, [paymentResult, order_id]);

  async function handleStripeCheckout() {
    if (!invoice) return;
    setSubmitting(true);
    const res = await fetch(`/api/invoices/${invoice.id}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pay_deposit: payDeposit }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFlashMsg({ type: "error", text: data.error ?? "Could not create checkout session." });
      setSubmitting(false);
      return;
    }
    window.location.href = data.url;
  }

  async function handleAchConfirm() {
    if (!invoice) return;
    setSubmitting(true);
    const res = await fetch(`/api/invoices/${invoice.id}/ach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: achMethod, pay_deposit: payDeposit }),
    });
    if (res.ok) {
      setAchSent(true);
      const { invoices } = await fetch(`/api/invoices?order_id=${order_id}`).then((r) => r.json());
      const active = (invoices ?? []).find((i: Invoice) => i.status !== "canceled");
      if (active) setInvoice(active);
    } else {
      const d = await res.json();
      setFlashMsg({ type: "error", text: d.error ?? "Failed to record payment intent." });
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center gap-4 p-8">
        <p className="font-display text-xl font-bold uppercase tracking-wide text-brand-text">No Invoice Yet</p>
        <p className="text-sm text-brand-muted font-barlow">Your invoice will appear here once it has been prepared by {tenant.name}.</p>
        <a href={`/orders/${order_id}/tracker`} className="text-xs font-display uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">
          ← Back to Order Tracker
        </a>
      </div>
    );
  }

  const statusInfo  = STATUS_LABEL[invoice.status] ?? STATUS_LABEL.pending_payment;
  const isPaid      = invoice.status === "paid";
  const isPending   = invoice.status === "pending_verification";
  const isPartial   = invoice.status === "partially_paid";
  const payableAmt  = payDeposit && invoice.deposit_amount > 0 ? invoice.deposit_amount : invoice.balance_due ?? invoice.total_amount;

  const hasBankDetails = !!(invoice.bank_routing || invoice.bank_account || invoice.bank_name);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <OrgLogo className="h-10" href="/portal" />
        </div>
        <a
          href={`/orders/${order_id}/tracker`}
          className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
        >
          ← Order Tracker
        </a>
      </header>

      <main className="flex-1 px-4 py-10 max-w-2xl mx-auto w-full space-y-6">

        {/* Flash message */}
        {flashMsg && (
          <div className={`rounded-xl px-4 py-3 text-sm font-barlow border ${
            flashMsg.type === "success"
              ? "bg-green-400/10 border-green-400/30 text-green-400"
              : "bg-red-900/20 border-red-400/30 text-red-400"
          }`}>
            {flashMsg.text}
          </div>
        )}

        {/* Invoice card */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-display uppercase tracking-[0.25em] text-brand-muted">{tenant.name}</p>
              <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text mt-1">
                Invoice
              </h1>
              <p className="text-xs font-barlow text-brand-muted mt-0.5">{invoice.invoice_number}</p>
            </div>
            <span className={`text-[10px] font-display uppercase tracking-wider px-3 py-1 rounded-full border ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>

          <hr className="border-brand-border" />

          {/* Invoice details */}
          <div className="space-y-2">
            {orderName && (
              <div className="flex justify-between items-center py-1">
                <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Team / Order</span>
                <span className="text-sm font-barlow text-brand-text font-medium">{orderName}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-1 border-t border-brand-border">
              <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Total</span>
              <span className="text-base font-display font-bold text-brand-text">
                {formatCurrency(invoice.total_amount, invoice.currency)}
              </span>
            </div>
            {invoice.deposit_amount > 0 && (
              <>
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Deposit Due</span>
                  <span className="text-sm font-barlow text-brand-text">
                    {formatCurrency(invoice.deposit_amount, invoice.currency)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Balance Due</span>
                  <span className="text-sm font-barlow text-brand-text">
                    {formatCurrency(invoice.balance_due ?? (invoice.total_amount - invoice.deposit_amount), invoice.currency)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Paid payments summary */}
          {invoice.payments.filter((p) => p.status === "paid").length > 0 && (
            <div className="bg-green-400/5 border border-green-400/20 rounded-lg px-4 py-3 space-y-1">
              <p className="text-[10px] font-display uppercase tracking-wider text-green-400">Payments Received</p>
              {invoice.payments.filter((p) => p.status === "paid").map((p) => (
                <div key={p.id} className="flex justify-between text-xs font-barlow text-brand-text">
                  <span className="capitalize">{p.method === "stripe" ? "Card" : p.method.toUpperCase()}</span>
                  <span>{formatCurrency(p.amount, invoice.currency)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Pending verification notice */}
          {(isPending || invoice.payments.some((p) => p.status === "pending_verification")) && (
            <div className="bg-blue-400/5 border border-blue-400/20 rounded-lg px-4 py-3">
              <p className="text-[10px] font-display uppercase tracking-wider text-blue-400 mb-1">Transfer Under Review</p>
              <p className="text-xs font-barlow text-brand-muted">
                We have received your payment notification. Our team will verify your transfer within 1–2 business days and update your order status.
              </p>
            </div>
          )}
        </div>

        {/* Payment options — only when action is needed */}
        {!isPaid && !isPending && (
          <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
            <div className="px-6 pt-5 pb-3">
              <p className="text-[10px] font-display uppercase tracking-[0.25em] text-brand-primary">Payment Options</p>
              <p className="text-sm font-barlow text-brand-muted mt-1">
                {invoice.payment_threshold_band === "small" && "Secure card payment via Stripe."}
                {invoice.payment_threshold_band === "hybrid" && "Both card and bank transfer are available. Choose the option that works best for your organization."}
                {invoice.payment_threshold_band === "large" && "For larger custom program orders, bank transfer is recommended for streamlined business payments. Card payment is also available."}
                {invoice.payment_threshold_band === "enterprise" && "For enterprise production invoices, bank transfer is standard. Card payments are available upon request — contact your account lead."}
              </p>
            </div>

            {/* Deposit toggle */}
            {invoice.deposit_amount > 0 && isPartial === false && (
              <div className="px-6 pb-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPayDeposit(false)}
                  className={`px-3 py-1.5 rounded-full text-xs font-barlow font-medium transition-all
                    ${!payDeposit ? "bg-brand-primary text-white" : "bg-brand-bg border border-brand-border text-brand-muted hover:border-brand-primary"}`}
                >
                  Pay Full — {formatCurrency(invoice.total_amount, invoice.currency)}
                </button>
                <button
                  type="button"
                  onClick={() => setPayDeposit(true)}
                  className={`px-3 py-1.5 rounded-full text-xs font-barlow font-medium transition-all
                    ${payDeposit ? "bg-brand-primary text-white" : "bg-brand-bg border border-brand-border text-brand-muted hover:border-brand-primary"}`}
                >
                  Deposit Only — {formatCurrency(invoice.deposit_amount, invoice.currency)}
                </button>
              </div>
            )}

            {/* Tabs */}
            <div className="px-6 flex gap-1 border-b border-brand-border">
              {invoice.card_enabled && (
                <button
                  type="button"
                  onClick={() => setActiveTab("card")}
                  className={`pb-3 pt-1 text-xs font-display font-bold uppercase tracking-wider transition-colors border-b-2 mr-4
                    ${activeTab === "card"
                      ? "border-brand-primary text-brand-primary"
                      : "border-transparent text-brand-muted hover:text-brand-text"
                    }`}
                >
                  {invoice.recommended_payment_method === "stripe" ? "Pay by Card ★" : "Pay by Card"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab("ach")}
                className={`pb-3 pt-1 text-xs font-display font-bold uppercase tracking-wider transition-colors border-b-2
                  ${activeTab === "ach"
                    ? "border-brand-primary text-brand-primary"
                    : "border-transparent text-brand-muted hover:text-brand-text"
                  }`}
              >
                {invoice.recommended_payment_method === "ach_wire" ? "Bank Transfer ★" : "Bank Transfer"}
              </button>
            </div>

            <div className="px-6 py-5">
              {/* Card tab */}
              {activeTab === "card" && invoice.card_enabled && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-barlow font-medium text-brand-text">
                        {formatCurrency(payableAmt, invoice.currency)} via Stripe
                      </p>
                      <p className="text-xs font-barlow text-brand-muted mt-0.5">
                        Visa, Mastercard, Amex, and more. Processed securely by Stripe.
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {["VISA", "MC", "AMEX"].map((c) => (
                        <span key={c} className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-brand-border text-brand-muted bg-brand-bg">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleStripeCheckout}
                    disabled={submitting}
                    className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 transition-all"
                  >
                    {submitting ? "Redirecting to Stripe…" : `Pay ${formatCurrency(payableAmt, invoice.currency)} by Card →`}
                  </button>
                  <p className="text-[10px] font-barlow text-brand-muted opacity-70 text-center">
                    You will be redirected to Stripe's secure checkout. Return here after payment.
                  </p>
                </div>
              )}

              {/* ACH / Wire tab */}
              {activeTab === "ach" && (
                <div className="space-y-5">
                  {/* Method picker */}
                  <div className="flex gap-2">
                    {(["ach", "wire"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAchMethod(m)}
                        className={`px-3 py-1.5 rounded-full text-xs font-barlow font-medium transition-all
                          ${achMethod === m
                            ? "bg-brand-primary text-white"
                            : "bg-brand-bg border border-brand-border text-brand-muted hover:border-brand-primary"
                          }`}
                      >
                        {m === "ach" ? "ACH Transfer" : "Wire Transfer"}
                      </button>
                    ))}
                  </div>

                  {/* Bank details */}
                  {hasBankDetails ? (
                    <div className="bg-brand-bg border border-brand-border rounded-lg divide-y divide-brand-border text-sm">
                      {[
                        ["Business Name", invoice.bank_beneficiary],
                        ["Bank",          invoice.bank_name],
                        ["Routing #",     invoice.bank_routing],
                        ["Account #",     invoice.bank_account],
                        ...(achMethod === "wire" && invoice.bank_swift ? [["SWIFT / BIC", invoice.bank_swift] as [string, string | null]] : []),
                        ["Reference",     invoice.invoice_number],
                        ["Amount Due",    formatCurrency(payableAmt, invoice.currency)],
                      ].filter(([, v]) => v).map(([label, value]) => (
                        <div key={label} className="flex items-start justify-between px-4 py-2.5 gap-4">
                          <span className="text-xs font-display uppercase tracking-wider text-brand-muted flex-shrink-0 w-32">{label}</span>
                          <span className="text-xs font-barlow text-brand-text text-right font-medium select-all">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-brand-bg border border-brand-border rounded-lg px-4 py-4 text-center">
                      <p className="text-sm font-barlow text-brand-muted">
                        Bank transfer details will be provided by {tenant.name} shortly.
                      </p>
                    </div>
                  )}

                  <div className="text-xs font-barlow text-brand-muted space-y-1">
                    <p>• Use the invoice number as your payment reference</p>
                    <p>• Allow 1–3 business days for ACH; same day for domestic wire</p>
                    <p>• Your order will proceed once payment is verified by our team</p>
                  </div>

                  {achSent ? (
                    <div className="bg-blue-400/10 border border-blue-400/30 rounded-lg px-4 py-3 text-sm font-barlow text-blue-400">
                      Transfer notification recorded. We'll verify and update your order within 1–2 business days.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAchConfirm}
                      disabled={submitting}
                      className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 transition-all"
                    >
                      {submitting ? "Recording…" : "I've Sent Payment →"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fully paid state */}
        {isPaid && (
          <div className="bg-green-400/5 border border-green-400/20 rounded-xl px-6 py-8 text-center space-y-2">
            <p className="font-display text-xl font-bold uppercase tracking-wide text-green-400">Paid in Full</p>
            <p className="text-sm font-barlow text-brand-muted">
              Your invoice is settled. Your order is cleared for production.
            </p>
            <a
              href={`/orders/${order_id}/tracker`}
              className="inline-block mt-3 text-xs font-display uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors"
            >
              View Order Status →
            </a>
          </div>
        )}

        <div className="text-center">
          <a
            href={`/orders/${order_id}/tracker`}
            className="text-xs font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
          >
            ← Back to Order Tracker
          </a>
        </div>

      </main>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense>
      <InvoicePageContent />
    </Suspense>
  );
}
