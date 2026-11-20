-- Client receipt code (Oliver, Nov 19): the QR on the client's receipt opens /r/<receipt_code>, never the ticket id
-- (the ticket id is the staff slip's link). Same one-way value the app makes offline (src/lib/receipt-code.ts):
-- first 16 hex of SHA-256('receipt:' || ticket id). Every ticket has one, old ones too; it never changes.
alter table public.tickets add column receipt_code text
  generated always as (left(encode(extensions.digest('receipt:' || id::text, 'sha256'), 'hex'), 16)) stored;
create unique index tickets_receipt_code on public.tickets (receipt_code);
