// Terms, privacy and text-message terms in plain words. One place, shown at /legal/<doc>.
// DRAFT (Nov 18): have a lawyer read these before the first paying salon. CONTACT must be a real inbox.
export const LEGAL_UPDATED = "November 18, 2026";
export const CONTACT = "support@polishosapp.com";
export const COMPANY = "EO Collective";

export type LegalDoc = { title: string; intro: string; parts: { h: string; p: string[] }[] };

export const LEGAL: Record<"terms" | "privacy" | "texts", LegalDoc> = {
  terms: {
    title: "Terms of use",
    intro: `PolishOS is made by ${COMPANY}. These terms are the deal between us and a salon that uses PolishOS. By using PolishOS you agree to them.`,
    parts: [
      { h: "What PolishOS does", p: [
        "PolishOS helps a nail salon run its day: checkout, booking, staff pay sheets, client history and reports.",
        "We give you the tool. You run your salon, set your prices and pay your staff. The numbers PolishOS shows help you decide; they are not legal, tax or payroll advice.",
      ] },
      { h: "Your account", p: [
        "Salons join by invite. The owner decides who is on the team and what each person can do.",
        "Keep sign-in codes, passwords and PINs private. Tell us right away if you think someone else got in.",
      ] },
      { h: "Your data stays yours", p: [
        "The salon owns its data: clients, tickets, bookings, staff and pay records. You can ask for a copy at any time.",
        "We do not sell your data and we do not read private client or staff details. We see salon health only (for example: is the reader online, did the day close).",
        "We open a salon's account to help only when the owner turns on support access. It ends by itself after 24 hours and every step is logged.",
      ] },
      { h: "Price and payment", p: [
        "One flat price per salon, shown before you start. All staff are included. No extra fee per tech, per new client or per payout.",
        "Promo texts use prepaid text credit. The cost is shown before every send.",
        "You can cancel any time. Your plan runs to the end of the period you paid for.",
      ] },
      { h: "Card payments", p: [
        "Card payments run on Stripe, in the salon's own Stripe account. Money goes from the client to the salon. Stripe's fees and Stripe's own terms apply.",
        "PolishOS never holds your money and adds nothing on top of the card fee.",
      ] },
      { h: "Tips and pay", p: [
        "Tips belong to the staff who earned them. PolishOS shows tips and any card fee on every ticket.",
        "The salon is responsible for following wage, tip and tax law in its state.",
      ] },
      { h: "Fair use", p: [
        "Do not use PolishOS to break the law, to send texts people did not agree to, or to get into another salon's data.",
        "We may pause an account that does this, after telling the owner why.",
      ] },
      { h: "When things go wrong", p: [
        "PolishOS works with weak or no internet and syncs later, and we back up data every day. Still, no software is perfect and we cannot promise it never stops.",
        "As far as the law allows, what we owe you for a problem is limited to what you paid us in the 3 months before it.",
      ] },
      { h: "Leaving", p: [
        "If you stop using PolishOS, ask us and we send your data. After that we delete it, except what the law makes us keep.",
      ] },
      { h: "Changes", p: [
        "If we change these terms we tell the owner by email or text before the change starts.",
        `Questions: ${CONTACT}.`,
      ] },
    ],
  },
  privacy: {
    title: "Privacy",
    intro: `This page says what PolishOS (made by ${COMPANY}) keeps, why, and who can see it.`,
    parts: [
      { h: "Who is in charge of the data", p: [
        "Each salon owns its data and decides how it is used. PolishOS keeps it safe for the salon.",
        "If you are a client and want to see, fix or remove your details, ask your salon. They can do it, and we help them if needed.",
      ] },
      { h: "What we keep", p: [
        "Salon owners and staff: name, phone, email, role, a PIN (stored scrambled, we cannot read it), clock-in times, earnings and tips.",
        "Clients: name, phone, email if given, birthday if given, visits, services, notes and nail photos the salon adds, gift card and points balance, and whether you said yes to texts.",
        "Payments: amount, tip, time, card type and last 4 digits. Full card numbers never reach PolishOS; Stripe handles them.",
        "Devices: the type of device and browser, to keep sign-in safe and fix problems.",
      ] },
      { h: "Why we keep it", p: [
        "To run checkout, booking, pay sheets and reports for the salon.",
        "To send texts and emails you agreed to: codes, confirmations, reminders, receipts.",
        "To keep accounts safe and find problems.",
      ] },
      { h: "Who can see it", p: [
        "Only people in your salon, and each role sees only its part. For example, a tech sees their own bookings and only the last 4 digits of a client's phone.",
        "Our team sees salon health, not private details, unless the owner turns on support access for 24 hours.",
        "Companies that help us run the service, only as needed: Supabase (database), Vercel (hosting), Stripe (payments), Twilio (texts and login codes), an email sender, and Anthropic (reads a menu when a salon asks to import one).",
        "We never sell personal data and never share it for ads.",
      ] },
      { h: "How long", p: [
        "As long as the salon uses PolishOS. When a salon leaves, we give back its data and delete it, except records the law makes us keep.",
      ] },
      { h: "Keeping it safe", p: [
        "Data is walled off per salon, sent over a secure connection and backed up daily. Staff actions use a PIN and are logged.",
      ] },
      { h: "Your choices", p: [
        "Texts: reply STOP to any text to stop them. Reply HELP for help.",
        "You can ask to see, fix or delete your details. Ask your salon, or write to us and we pass it on.",
        `Questions: ${CONTACT}.`,
      ] },
    ],
  },
  texts: {
    title: "Text messages",
    intro: "Salons that use PolishOS can send text messages to their clients and staff. This page says what to expect.",
    parts: [
      { h: "What you get", p: [
        "If you said yes to texts when booking or at the salon: booking confirmations, reminders (about 1 day and 2 hours before), receipts, and now and then an offer from your salon.",
        "Sign-in codes are sent only when you ask to sign in.",
      ] },
      { h: "Saying yes is your choice", p: [
        "Texts are off until you say yes. You do not have to say yes to book or to buy anything.",
      ] },
      { h: "How many and what it costs", p: [
        "How many depends on your visits; usually a few per booking. We do not charge for texts. Your phone company's message and data rates may apply.",
      ] },
      { h: "Stop or get help", p: [
        "Reply STOP to any text to stop all texts from that salon. Reply HELP for help.",
        `You can also ask the salon, or write to ${CONTACT}.`,
      ] },
      { h: "Your number", p: [
        "Your phone number is used only by your salon, for the texts above. It is never sold or shared for ads. See the Privacy page.",
      ] },
    ],
  },
};
