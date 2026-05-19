import Link from "next/link";
import GraceLogo from "@/components/GraceLogo";

export const metadata = {
  title: "Privacy Policy — Grace Athletics",
  description: "How Grace Athletics collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
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
            <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-gs-white">Privacy Policy</h1>
            <p className="text-sm text-gs-muted font-barlow mt-2">Effective date: May 19, 2026 · Last updated: May 19, 2026</p>
          </div>

          <Section title="1. Who We Are">
            <P>
              Grace Athletics (&ldquo;Grace Athletics,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is a custom
              athletic apparel design and production company. We operate the Grace Athletics client portal and design platform
              (the &ldquo;Platform&rdquo;). Our contact email is{" "}
              <a href="mailto:info@graceathletics.com" className="text-gs-gold hover:underline">info@graceathletics.com</a>.
            </P>
          </Section>

          <Section title="2. Information We Collect">
            <P>We collect the following categories of personal information when you use our Platform:</P>
            <ul className="list-none space-y-3 mt-3">
              <Li label="Account information">
                Full name, email address, and password when you create an account.
              </Li>
              <Li label="Organization information">
                Team or program name, contact name, city, and sport when you submit a design brief.
              </Li>
              <Li label="Design brief data">
                Design preferences, color selections, uploaded logo files, reference images, vision notes, player names, and
                roster details you provide as part of your order.
              </Li>
              <Li label="Order information">
                Order history, payment status, and production stage associated with your account.
              </Li>
              <Li label="Communications">
                Any messages, feedback, or support requests you send us.
              </Li>
              <Li label="Usage data">
                Log data including IP address, browser type, pages visited, and timestamps, collected automatically when
                you access the Platform.
              </Li>
            </ul>
            <P className="mt-4">
              We do <strong className="text-gs-white">not</strong> collect or store payment card numbers directly.
              Payment processing is handled by our third-party payment provider and is subject to their privacy practices.
            </P>
          </Section>

          <Section title="3. How We Use Your Information">
            <P>We use the information we collect to:</P>
            <ul className="list-none space-y-2 mt-3">
              <Li>Process and fulfill your design and production orders</Li>
              <Li>Generate AI-assisted design concepts based on your brief</Li>
              <Li>Communicate with you about your order status, approvals, and delivery</Li>
              <Li>Send transactional emails (concept ready notifications, approval confirmations, shipping updates)</Li>
              <Li>Improve and develop our Platform and services</Li>
              <Li>Comply with legal obligations and resolve disputes</Li>
            </ul>
            <P className="mt-4">
              We do <strong className="text-gs-white">not</strong> sell your personal information to third parties.
            </P>
          </Section>

          <Section title="4. Sharing Your Information">
            <P>We may share your information with:</P>
            <ul className="list-none space-y-3 mt-3">
              <Li label="Production partners">
                Supplier and manufacturing partners receive order details (team name, garment specifications) necessary to
                fulfill your production order. They do not receive login credentials or payment details.
              </Li>
              <Li label="Service providers">
                We use third-party services including Supabase (database and authentication), Vercel (hosting), Resend
                (email delivery), and OpenAI (AI design generation). Each provider is contractually bound to protect your data.
              </Li>
              <Li label="Legal requirements">
                We may disclose information if required to do so by law, court order, or governmental authority.
              </Li>
            </ul>
          </Section>

          <Section title="5. Intellectual Property">
            <P>
              All design concepts, artwork, mockups, and creative materials generated through our Platform are and remain the
              exclusive intellectual property of Grace Athletics unless a separate written licensing or ownership transfer
              agreement is executed between Grace Athletics and the client. Submitting a design brief grants Grace Athletics a
              license to create, retain, and display these designs. For inquiries about licensing or IP transfer agreements,
              contact us at{" "}
              <a href="mailto:info@graceathletics.com" className="text-gs-gold hover:underline">info@graceathletics.com</a>.
            </P>
          </Section>

          <Section title="6. Data Retention">
            <P>
              We retain your personal information and order data for as long as your account is active and as long as necessary
              to fulfill our legal and business obligations (typically up to 7 years for financial records). You may request
              deletion of your account by contacting us.
            </P>
          </Section>

          <Section title="7. Security">
            <P>
              We implement industry-standard security measures including encrypted connections (HTTPS/TLS), access controls,
              and secure cloud infrastructure to protect your data. No system is 100% secure, and we cannot guarantee absolute
              security, but we take reasonable precautions to protect your information.
            </P>
          </Section>

          <Section title="8. Your Rights">
            <P>Depending on your location, you may have the right to:</P>
            <ul className="list-none space-y-2 mt-3">
              <Li>Access the personal information we hold about you</Li>
              <Li>Request correction of inaccurate data</Li>
              <Li>Request deletion of your personal data (subject to legal retention requirements)</Li>
              <Li>Object to certain processing activities</Li>
              <Li>Withdraw consent where processing is based on consent</Li>
            </ul>
            <P className="mt-4">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:info@graceathletics.com" className="text-gs-gold hover:underline">info@graceathletics.com</a>.
              We will respond within 30 days.
            </P>
          </Section>

          <Section title="9. Children's Privacy">
            <P>
              Our Platform is not directed at children under 13. We do not knowingly collect personal information from children
              under 13. If you believe a child has provided us with personal information, please contact us and we will delete it.
            </P>
          </Section>

          <Section title="10. Changes to This Policy">
            <P>
              We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated
              policy on this page with a revised effective date. Continued use of the Platform after changes constitutes
              acceptance of the updated policy.
            </P>
          </Section>

          <Section title="11. Contact Us">
            <P>
              If you have questions about this Privacy Policy or how we handle your data, please contact us at{" "}
              <a href="mailto:info@graceathletics.com" className="text-gs-gold hover:underline">info@graceathletics.com</a>.
            </P>
          </Section>

          <div className="pt-6 border-t border-gs-border">
            <Link
              href="/portal"
              className="text-sm font-display font-bold uppercase tracking-widest text-gs-muted hover:text-gs-gold transition-colors"
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
