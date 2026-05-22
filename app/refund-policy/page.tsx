import Link from "next/link";
import TenantLogo from "@/components/TenantLogo";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  const name = tenant?.name ?? "Grace Athletics";
  return {
    title: `Refund & Cancellation Policy — ${name}`,
    description: `${name} refund, cancellation, and revision policy for custom athletic apparel orders.`,
  };
}

export default async function RefundPolicyPage() {
  const tenant = await getRequestTenant();
  const name  = tenant?.name ?? "Grace Athletics";
  const email = tenant?.support_email ?? "info@graceathletics.com";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <TenantLogo className="h-7" href="/" />
        <Link
          href="/portal"
          className="text-xs font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors"
        >
          ← Back to Portal
        </Link>
      </header>

      <main className="flex-1 px-4 py-12 flex justify-center">
        <div className="w-full max-w-3xl space-y-10">

          <div>
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-2">Legal</p>
            <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-brand-text">Refund &amp; Cancellation Policy</h1>
            <p className="text-sm text-brand-muted font-barlow mt-2">Effective date: May 19, 2026 · Last updated: May 19, 2026</p>
          </div>

          <Section title="Overview">
            <P>
              {name} produces custom athletic apparel made to order. Because every garment is manufactured
              specifically for your program, our ability to offer refunds is limited once production has begun.
              Please read this policy carefully before placing an order.
            </P>
          </Section>

          <Section title="1. Design Fee">
            <P>
              The design fee covers AI-assisted concept generation and designer review. It is{" "}
              <strong className="text-brand-text">non-refundable</strong> once concept generation has begun, as design
              work is performed immediately upon brief submission.
            </P>
            <P>
              If a technical failure on our part prevents concept delivery, we will regenerate your concepts at no
              additional charge or issue a full refund of the design fee upon request.
            </P>
          </Section>

          <Section title="2. Production Deposit">
            <div className="space-y-3">
              <P>
                The production deposit (50% of your total production order) is collected after design approval and
                initiates manufacturing.
              </P>
              <ul className="list-none space-y-3 mt-2">
                <Li label="Before production starts">
                  Full refund of the production deposit if you cancel before we have confirmed your order with our
                  manufacturing partner.
                </Li>
                <Li label="After production starts">
                  <strong className="text-brand-text">No refund</strong> once production has been confirmed and
                  materials have been ordered. We will do everything possible to accommodate changes to quantities
                  or sizing, but cannot guarantee it at this stage.
                </Li>
              </ul>
            </div>
          </Section>

          <Section title="3. Balance Payment & Delivery">
            <P>
              The remaining balance (50% of total) is due upon delivery of your completed order. Refunds on the
              balance payment are subject to our defect and quality guarantee below.
            </P>
          </Section>

          <Section title="4. Defects & Quality Issues">
            <P>
              We stand behind the quality of every garment we produce. If your order arrives with manufacturing
              defects, incorrect colors, or items that materially differ from the approved design, we will:
            </P>
            <ul className="list-none space-y-2 mt-3">
              <Li>Remake the affected items at no charge, or</Li>
              <Li>Issue a partial or full refund at our discretion based on the nature of the defect</Li>
            </ul>
            <P className="mt-3">
              Claims must be submitted within <strong className="text-brand-text">7 days of delivery</strong> with
              photos documenting the issue. Contact us at{" "}
              <a href={`mailto:${email}`} className="text-brand-primary hover:underline">{email}</a>.
            </P>
            <P>
              Normal variation in color between screen previews and physical garments is not considered a defect.
              AI concept renders are visual direction only and are not a guaranteed exact representation of the
              finished product.
            </P>
          </Section>

          <Section title="5. Design Revisions">
            <P>
              Your design direction is locked after brief submission. Post-approval revisions are subject to the
              following fees:
            </P>
            <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden mt-3">
              <table className="w-full text-sm font-barlow">
                <thead>
                  <tr className="border-b border-brand-border">
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted">Revision Type</th>
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted">Fee</th>
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted">Availability</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Color change", "$25", "Before production"],
                    ["Logo change", "$75", "Before production"],
                    ["Layout / panel change", "$150", "Before production"],
                    ["Post-production change", "Not available", "—"],
                  ].map(([type, fee, avail]) => (
                    <tr key={type} className="border-b border-brand-border last:border-b-0">
                      <td className="px-5 py-3 text-brand-text">{type}</td>
                      <td className="px-5 py-3 text-brand-primary font-semibold">{fee}</td>
                      <td className="px-5 py-3 text-brand-muted">{avail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="6. Cancellations">
            <ul className="list-none space-y-3">
              <Li label="Before brief submission">
                You may cancel your order at any time with no charge.
              </Li>
              <Li label="After brief submission, before design approval">
                The design fee is non-refundable. No production charges apply.
              </Li>
              <Li label="After design approval, before production confirmed">
                Design fee non-refundable. Production deposit fully refundable.
              </Li>
              <Li label="After production confirmed">
                Design fee and production deposit are non-refundable. We will attempt to pause production
                if possible, but cannot guarantee it.
              </Li>
            </ul>
          </Section>

          <Section title="7. How to Request a Refund or Cancellation">
            <P>
              Email us at{" "}
              <a href={`mailto:${email}`} className="text-brand-primary hover:underline">{email}</a>{" "}
              with your order number and the reason for your request. We respond within 2 business days.
              Approved refunds are processed within 5–10 business days to the original payment method.
            </P>
          </Section>

          <div className="pt-6 border-t border-brand-border">
            <Link
              href="/portal"
              className="text-sm font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors"
            >
              ← Return to Portal
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold uppercase tracking-wider text-brand-text border-b border-brand-border pb-2">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-sm font-barlow text-brand-muted leading-relaxed ${className}`}>{children}</p>
  );
}

function Li({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm font-barlow text-brand-muted leading-relaxed">
      <span className="text-brand-primary mt-0.5 flex-shrink-0">—</span>
      <span>
        {label && <strong className="text-brand-text">{label}: </strong>}
        {children}
      </span>
    </li>
  );
}
