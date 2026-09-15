-- Moodbite: an optional phone number on the profile.
--
-- Unverified by design. This is a field someone types, not an identity the
-- system has proved: nothing signs in with it and nothing is authorised by it.
-- Treat it as a contact detail volunteered, which means some of them will be
-- wrong and none of them are a login.
--
-- Verifying numbers means an OTP through an SMS or WhatsApp provider, which
-- costs per message and is a separate decision. Do not let this column drift
-- into being treated as verified because it looks like a phone number.
--
-- Run after 0007_drop_spice_interest.sql.

alter table public.profiles add column if not exists phone text;

comment on column public.profiles.phone is
  'Self-reported, never verified. Not a login and not proof of anything. Messaging these numbers in India needs consent plus TRAI/DLT registration for SMS, or a WhatsApp opt-in.';

-- Records that the person actively agreed to be contacted on it, separately
-- from having typed it in. Consent and possession are different facts, and a
-- number collected without the first is a number you cannot use.
alter table public.profiles add column if not exists phone_contact_ok boolean not null default false;

comment on column public.profiles.phone_contact_ok is
  'Explicit opt-in to being contacted. Absent this, the number is on file but not usable for outreach.';
