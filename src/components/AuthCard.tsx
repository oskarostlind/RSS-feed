import Link from "next/link";

/**
 * Ramen kring inloggning, registrering, verifiering och återställning.
 *
 * Fyra sidor med samma kort betyder annars fyra kopior av samma klasslista, och
 * den sortens kopia glider isär vid första ändringen. Att de ser *identiska* ut
 * spelar dessutom roll här mer än vanligt: sidorna nås från mejl, och en sida
 * som ser lite annorlunda ut än den man väntade sig är precis vad man ska
 * misstänka i ett nätfiskeförsök.
 */

interface AuthCardProps {
  rubrik: string;
  ingress?: string;
  children: React.ReactNode;
}

export function AuthCard({ rubrik, ingress, children }: AuthCardProps) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Kundnytt
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {rubrik}
        </h1>
        {ingress ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {ingress}
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {children}
    </p>
  );
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
    >
      {children}
    </p>
  );
}

export const AUTH_INPUT =
  "mt-2 block h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-300";

export const AUTH_BUTTON =
  "h-11 w-full rounded-lg bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

export function AuthField({
  namn,
  etikett,
  typ,
  autoComplete,
  placeholder,
  hjalptext,
}: {
  namn: string;
  etikett: string;
  typ: string;
  autoComplete: string;
  placeholder?: string;
  hjalptext?: string;
}) {
  return (
    <div>
      <label
        htmlFor={namn}
        className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        {etikett}
      </label>
      <input
        id={namn}
        name={namn}
        type={typ}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={AUTH_INPUT}
      />
      {hjalptext ? (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {hjalptext}
        </p>
      ) : null}
    </div>
  );
}

export function AuthFooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-zinc-600 underline underline-offset-4 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
    >
      {children}
    </Link>
  );
}
