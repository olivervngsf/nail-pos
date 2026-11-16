import { CARD_FEE, serviceById } from "./data";

export const fmt = (cents: number) =>
  (cents < 0 ? "-$" : "$") + (Math.abs(cents) / 100).toFixed(2);

export const sumServices = (ids: string[]) =>
  ids.reduce((t, id) => t + (serviceById(id)?.priceCents ?? 0), 0);

export const minutesFor = (ids: string[]) =>
  ids.reduce((t, id) => t + (serviceById(id)?.minutes ?? 0), 0);

export const cardFee = (chargedCents: number) =>
  Math.round((chargedCents * CARD_FEE.pct) / 100) + CARD_FEE.fixedCents;

export const prettyPhone = (d: string) =>
  d.length <= 3
    ? d
    : d.length <= 6
      ? `(${d.slice(0, 3)}) ${d.slice(3)}`
      : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;

export const timeOf = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
