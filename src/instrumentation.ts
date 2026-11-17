// Error alerts (Sentry). Off until SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is set in Vercel.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.VERCEL_ENV ?? "development" });
}

export const onRequestError = Sentry.captureRequestError;
