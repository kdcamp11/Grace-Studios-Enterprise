import Link from "next/link";

export default function GraceLogo({ className = "h-8", href = "/portal" }: {
  className?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="inline-flex items-center focus:outline-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Grace Athletics"
        className={`w-auto object-contain ${className}`}
      />
    </Link>
  );
}
