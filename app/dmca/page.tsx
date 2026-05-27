import Link from "next/link";
import TenantLogo from "@/components/TenantLogo";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  const name = tenant?.name ?? "Grace Athletics";
  return {
    title: `DMCA Policy | ${name}`,
    description: `${name} Digital Millennium Copyright Act policy and takedown notice procedures.`,
  };
}

export default async function DmcaPage() {
  const tenant = await getRequestTenant();
  const name   = tenant?.name ?? "Grace Athletics";
  const email  = tenant?.support_email ?? "dmca@graceathletics.com";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <TenantLogo className="h-7" href="/" />
        <Link href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">
          ← Back to Portal
        </Link>
      </header>

      <main className="flex-1 px-4 py-12 flex justify-center">
        <div className="w-full max-w-3xl space-y-10">

          <div>
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-2">Legal</p>
            <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-brand-text">DMCA Policy</h1>
            <p className="text-sm text-brand-muted font-barlow mt-2">Effective date: May 19, 2026 · Last updated: May 19, 2026</p>
          </div>

          <Section title="Overview">
            <P>
              {name} respects the intellectual property rights of others and complies with the Digital
              Millennium Copyright Act (DMCA), 17 U.S.C. § 512. Users of our platform may upload logos, images,
              and other creative assets as part of their design brief. If you believe your copyrighted work has
              been uploaded or used without authorization, please follow the procedure below.
            </P>
          </Section>

          <Section title="1. Filing a DMCA Takedown Notice">
            <P>
              To submit a notice of claimed copyright infringement, your written notice must include{" "}
              <strong className="text-brand-text">all</strong> of the following:
            </P>
            <ul className="list-none space-y-3 mt-3">
              <Li number="1">
                A physical or electronic signature of the copyright owner or a person authorized to act on their behalf.
              </Li>
              <Li number="2">
                Identification of the copyrighted work claimed to have been infringed. If multiple works are covered
                by a single notice, a representative list is acceptable.
              </Li>
              <Li number="3">
                Identification of the material claimed to be infringing, including sufficient information to allow
                {" "}{name} to locate it (e.g., the URL or order reference where the material appears).
              </Li>
              <Li number="4">
                Your contact information: name, mailing address, telephone number, and email address.
              </Li>
              <Li number="5">
                A statement that you have a good-faith belief that use of the material in the manner complained of
                is not authorized by the copyright owner, its agent, or the law.
              </Li>
              <Li number="6">
                A statement, made under penalty of perjury, that the information in the notification is accurate
                and that you are the copyright owner or authorized to act on the owner&rsquo;s behalf.
              </Li>
            </ul>

            <div className="mt-5 bg-brand-surface border border-brand-border rounded-xl p-5 space-y-2">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Send Takedown Notices To</p>
              <p className="text-sm font-barlow text-brand-text">{name}, DMCA Agent</p>
              <p className="text-sm font-barlow text-brand-muted">
                Email:{" "}
                <a href={`mailto:${email}`} className="text-brand-primary hover:underline">
                  {email}
                </a>
              </p>
              <p className="text-sm font-barlow text-brand-muted">Subject line: <span className="text-brand-text">DMCA Takedown Notice</span></p>
            </div>

            <P className="mt-4">
              We will respond to valid notices within <strong className="text-brand-text">10 business days</strong>.
              Upon receipt of a valid notice, we will promptly remove or disable access to the infringing material
              and notify the user who uploaded it.
            </P>
          </Section>

          <Section title="2. Counter-Notification">
            <P>
              If you believe material was removed or disabled as a result of a mistake or misidentification, you may
              submit a counter-notification. Your counter-notification must include:
            </P>
            <ul className="list-none space-y-3 mt-3">
              <Li number="1">Your physical or electronic signature.</Li>
              <Li number="2">
                Identification of the material that has been removed and the location where it appeared before removal.
              </Li>
              <Li number="3">
                A statement under penalty of perjury that you have a good-faith belief that the material was removed
                as a result of mistake or misidentification.
              </Li>
              <Li number="4">
                Your name, address, telephone number, and email address, and a statement that you consent to the
                jurisdiction of the Federal District Court for the judicial district where your address is located
                (or if you are outside the U.S., any judicial district where {name} may be found), and that
                you will accept service of process from the complainant.
              </Li>
            </ul>
            <P className="mt-3">
              Send counter-notifications to the same address above. Upon receipt of a valid counter-notification,
              we will forward it to the original complainant and may restore the material within 10–14 business days
              unless the complainant files a court action.
            </P>
          </Section>

          <Section title="3. Repeat Infringers">
            <P>
              {name} will terminate the accounts of users who are found to be repeat infringers of
              copyright in appropriate circumstances.
            </P>
          </Section>

          <Section title="4. Misrepresentation">
            <P>
              Under 17 U.S.C. § 512(f), any person who knowingly materially misrepresents that material is
              infringing, or that material was removed by mistake or misidentification, may be liable for damages,
              including costs and attorneys&rsquo; fees.
            </P>
          </Section>

          <Section title="5. User Responsibility">
            <P>
              By uploading logos, images, or other assets to the {name} platform, you represent that you
              own or have the necessary rights and permissions to use those assets. Uploading third-party copyrighted
              material without authorization is a violation of our{" "}
              <Link href="/terms" className="text-brand-primary hover:underline">Terms of Service</Link> and may result
              in account termination and legal liability.
            </P>
          </Section>

          <div className="pt-6 border-t border-brand-border flex flex-wrap gap-6">
            <Link href="/terms" className="text-sm font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">
              Terms of Service →
            </Link>
            <Link href="/privacy-policy" className="text-sm font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">
              Privacy Policy →
            </Link>
            <Link href="/portal" className="text-sm font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">
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
  return <p className={`text-sm font-barlow text-brand-muted leading-relaxed ${className}`}>{children}</p>;
}

function Li({ number, children }: { number?: string | number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm font-barlow text-brand-muted leading-relaxed">
      <span className="text-brand-primary font-bold flex-shrink-0 w-4">{number ?? "—"}</span>
      <span>{children}</span>
    </li>
  );
}
