import Link from "next/link";
import GraceLogo from "@/components/GraceLogo";

export const metadata = {
  title: "Terms of Service — Grace Athletics",
  description: "Terms and conditions governing use of the Grace Athletics platform and custom apparel services.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <GraceLogo className="h-7" href="/" />
        <Link
          href="/portal"
          className="text-xs font-display font-bold uppercase tracking-widest text-gs-muted hover:text-gs-gold transition-colors"
        >
          ← Back to Portal
        </Link>
      </header>

      <main className="flex-1 px-4 py-12 flex justify-center">
        <div className="w-full max-w-3xl space-y-10">

          <div>
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold mb-2">Legal</p>
            <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-gs-white">Terms of Service</h1>
            <p className="text-sm text-gs-muted font-barlow mt-2">Effective date: May 19, 2026 · Last updated: May 19, 2026</p>
          </div>

          <Section title="1. Agreement to Terms">
            <P>
              By creating an account, submitting a design brief, or using any part of the Grace Athletics platform
              (the &ldquo;Platform&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;).
              If you do not agree, do not use the Platform.
            </P>
            <P>
              These Terms apply to all users including clients (programs placing orders), suppliers (production partners),
              and any other person accessing the Platform.
            </P>
          </Section>

          <Section title="2. Services">
            <P>
              Grace Athletics provides custom athletic apparel design and production services, including:
            </P>
            <ul className="list-none space-y-2 mt-3">
              <Li>AI-assisted design concept generation based on client briefs</Li>
              <Li>Designer review and refinement of approved concepts</Li>
              <Li>Custom garment production through our supplier network</Li>
              <Li>Order management, tracking, and delivery coordination</Li>
            </ul>
            <P className="mt-3">
              All renders and concept boards are <strong className="text-gs-white">visual direction only</strong> and
              may not exactly match the finished product. Colors, proportions, and details are subject to refinement
              during production.
            </P>
          </Section>

          <Section title="3. Account Registration">
            <P>
              You must provide accurate, complete information when creating an account. You are responsible for
              maintaining the security of your account credentials and for all activity that occurs under your account.
              Notify us immediately at{" "}
              <a href="mailto:info@graceathletics.com" className="text-gs-gold hover:underline">info@graceathletics.com</a>{" "}
              if you suspect unauthorized access.
            </P>
            <P>
              You must be at least 18 years old and have the legal authority to enter into contracts on behalf of
              the organization you represent to use the Platform.
            </P>
          </Section>

          <Section title="4. Orders and Payment">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-display uppercase tracking-wider text-gs-gold mb-2">Design Fee</p>
                <P>
                  A design fee is charged before concept delivery. This fee covers AI concept generation and designer
                  review and is <strong className="text-gs-white">non-refundable</strong> once generation begins.
                  The current design fee is displayed at checkout and is subject to change with notice.
                </P>
              </div>
              <div>
                <p className="text-xs font-display uppercase tracking-wider text-gs-gold mb-2">Production Deposit</p>
                <P>
                  If you elect to proceed with production, a deposit of 50% of the total production cost is required
                  before manufacturing begins. This deposit is non-refundable once production is confirmed with our
                  supplier.
                </P>
              </div>
              <div>
                <p className="text-xs font-display uppercase tracking-wider text-gs-gold mb-2">Balance Payment</p>
                <P>
                  The remaining 50% balance is due upon delivery of your completed order. We reserve the right to
                  withhold shipment until full payment is received.
                </P>
              </div>
              <div>
                <p className="text-xs font-display uppercase tracking-wider text-gs-gold mb-2">Late Payments</p>
                <P>
                  Balances unpaid 30 days after delivery are subject to a 1.5% monthly late fee. Grace Athletics
                  reserves the right to suspend services on accounts with outstanding balances.
                </P>
              </div>
            </div>
          </Section>

          <Section title="5. Intellectual Property">
            <P>
              <strong className="text-gs-white">Grace Athletics owns all designs.</strong> All design concepts,
              artwork, mockups, technical files, and creative materials generated or developed through the Platform
              are and remain the exclusive intellectual property of Grace Athletics, regardless of which party
              provided the initial brief or creative direction.
            </P>
            <P>
              Upon full payment of all amounts owed for a completed production order, Grace Athletics grants you a
              limited, non-exclusive license to use the delivered garments for their intended purpose (athletic
              program use). This license does not include the right to reproduce, sublicense, or resell the designs.
            </P>
            <P>
              If you wish to obtain full ownership or broader licensing rights to a design, a separate written
              IP transfer or licensing agreement must be executed with Grace Athletics. Contact us at{" "}
              <a href="mailto:info@graceathletics.com" className="text-gs-gold hover:underline">info@graceathletics.com</a>{" "}
              to discuss terms.
            </P>
            <P>
              By uploading logos, images, or other assets to the Platform, you represent that you have the right
              to use and share those assets and grant Grace Athletics a license to use them solely for the purpose
              of fulfilling your order.
            </P>
          </Section>

          <Section title="6. Design Revisions">
            <P>
              Your design direction is locked upon brief submission. Post-submission revisions are available at
              additional cost before production begins:
            </P>
            <div className="bg-gs-dark-3 border border-gs-border rounded-xl overflow-hidden mt-3">
              <table className="w-full text-sm font-barlow">
                <thead>
                  <tr className="border-b border-gs-border">
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-gs-muted">Change</th>
                    <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-gs-muted">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Color change", "$25"],
                    ["Logo change", "$75"],
                    ["Layout / panel change", "$150"],
                  ].map(([type, fee]) => (
                    <tr key={type} className="border-b border-gs-border last:border-b-0">
                      <td className="px-5 py-3 text-gs-white">{type}</td>
                      <td className="px-5 py-3 text-gs-gold font-semibold">{fee}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <P className="mt-3">
              No revisions are available after production has been confirmed. See our{" "}
              <Link href="/refund-policy" className="text-gs-gold hover:underline">Refund &amp; Cancellation Policy</Link>{" "}
              for full details.
            </P>
          </Section>

          <Section title="7. Turnaround Times">
            <P>All timelines are estimates and are not guaranteed:</P>
            <ul className="list-none space-y-2 mt-3">
              <Li label="Design concept">Up to 3 business days after brief submission</Li>
              <Li label="First piece sample">Up to 2 business days after production deposit</Li>
              <Li label="Bulk production">Up to 10 business days after first piece approval</Li>
            </ul>
            <P className="mt-3">
              Grace Athletics is not liable for delays caused by supplier issues, shipping carriers, force majeure
              events, or circumstances outside our reasonable control.
            </P>
          </Section>

          <Section title="8. Acceptable Use">
            <P>You agree not to:</P>
            <ul className="list-none space-y-2 mt-3">
              <Li>Submit briefs or upload content that infringes third-party intellectual property rights</Li>
              <Li>Use the Platform to produce apparel promoting hate speech, violence, or illegal activity</Li>
              <Li>Attempt to reverse-engineer, scrape, or abuse the Platform or its AI systems</Li>
              <Li>Create multiple accounts to circumvent restrictions or fees</Li>
              <Li>Share account credentials with unauthorized parties</Li>
              <Li>Interfere with the Platform&rsquo;s operation or security</Li>
            </ul>
            <P className="mt-3">
              Grace Athletics reserves the right to refuse or cancel any order that violates these standards at
              our sole discretion.
            </P>
          </Section>

          <Section title="9. Disclaimer of Warranties">
            <P>
              The Platform and all services are provided <strong className="text-gs-white">&ldquo;as is&rdquo;</strong> and{" "}
              <strong className="text-gs-white">&ldquo;as available&rdquo;</strong> without warranties of any kind,
              express or implied, including warranties of merchantability, fitness for a particular purpose, or
              non-infringement. We do not warrant that the Platform will be error-free, uninterrupted, or that AI
              concept renders will meet your specific expectations.
            </P>
          </Section>

          <Section title="10. Limitation of Liability">
            <P>
              To the fullest extent permitted by law, Grace Athletics&rsquo; total liability for any claim arising
              out of or related to these Terms or the services shall not exceed the amount you paid for the specific
              order giving rise to the claim in the 12 months preceding the claim.
            </P>
            <P>
              Grace Athletics is not liable for any indirect, incidental, consequential, special, or punitive
              damages, including loss of profits, loss of data, or business interruption, even if advised of the
              possibility of such damages.
            </P>
          </Section>

          <Section title="11. Indemnification">
            <P>
              You agree to indemnify and hold harmless Grace Athletics, its officers, employees, and partners from
              any claims, losses, damages, or expenses (including reasonable legal fees) arising from: (a) your use
              of the Platform; (b) your violation of these Terms; (c) your violation of any third-party rights,
              including intellectual property rights in assets you upload; or (d) any content you submit.
            </P>
          </Section>

          <Section title="12. Termination">
            <P>
              Grace Athletics may suspend or terminate your account at any time for violation of these Terms, non-payment,
              or any other reason at our discretion, with or without notice. Upon termination, your right to use
              the Platform ceases immediately. Sections covering IP, payment obligations, limitation of liability,
              and indemnification survive termination.
            </P>
          </Section>

          <Section title="13. Governing Law & Disputes">
            <P>
              These Terms are governed by the laws of the state in which Grace Athletics is incorporated, without
              regard to conflict of law principles. Any dispute arising under these Terms shall first be attempted
              to be resolved through good-faith negotiation. If unresolved within 30 days, disputes shall be
              submitted to binding arbitration under the rules of the American Arbitration Association.
            </P>
            <P>
              You waive any right to participate in a class action lawsuit or class-wide arbitration against
              Grace Athletics.
            </P>
          </Section>

          <Section title="14. Changes to These Terms">
            <P>
              We may update these Terms from time to time. Material changes will be communicated via email or a
              prominent notice on the Platform at least 7 days before taking effect. Continued use of the Platform
              after changes take effect constitutes acceptance of the revised Terms.
            </P>
          </Section>

          <Section title="15. Contact">
            <P>
              Questions about these Terms?{" "}
              <a href="mailto:info@graceathletics.com" className="text-gs-gold hover:underline">info@graceathletics.com</a>
            </P>
          </Section>

          <div className="pt-6 border-t border-gs-border flex flex-wrap gap-6">
            <Link href="/privacy-policy" className="text-sm font-display font-bold uppercase tracking-widest text-gs-muted hover:text-gs-gold transition-colors">
              Privacy Policy →
            </Link>
            <Link href="/refund-policy" className="text-sm font-display font-bold uppercase tracking-widest text-gs-muted hover:text-gs-gold transition-colors">
              Refund Policy →
            </Link>
            <Link href="/portal" className="text-sm font-display font-bold uppercase tracking-widest text-gs-muted hover:text-gs-gold transition-colors">
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
      <h2 className="font-display text-lg font-bold uppercase tracking-wider text-gs-white border-b border-gs-border pb-2">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function P({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-sm font-barlow text-gs-muted leading-relaxed ${className}`}>{children}</p>
  );
}

function Li({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm font-barlow text-gs-muted leading-relaxed">
      <span className="text-gs-gold mt-0.5 flex-shrink-0">—</span>
      <span>
        {label && <strong className="text-gs-white">{label}: </strong>}
        {children}
      </span>
    </li>
  );
}
