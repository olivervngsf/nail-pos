import { defaultHours, NAIL_TEMPLATE, type Hours, type PayType, type Role, type Service, type Staff } from "@/lib/onboarding/data";

export type SetupState = {
  stage: "signup" | "code" | "wizard";
  salonId: string; // made on this device (uuid) so saving is safe to repeat
  step: number;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  salonName: string;
  salonPhone: string;
  address: string;
  state: string;
  hours: Hours[];
  svcWay: "photo" | "link" | "tpl";
  website: string;
  svcStage: "choose" | "reading" | "review";
  menu: Service[];
  staff: Staff[];
  stripe: "start" | "stripe" | "pending" | "done"; // pending = sent to Stripe, Stripe still checking
  stripeName?: string; // account name shown once connected
  reader: "start" | "done";
  readerLabel?: string;
  pairing: string;
  printer: string; // "NETUM NT-1809 · Bluetooth", "Wi-Fi printer", "USB printer"
  printWay?: "bt" | "wifi" | "usb";
  printed: boolean;
  device: "Front desk" | "Walk-in kiosk" | "Owner";
  deviceName: string;
  clients: "" | "file" | "later";
  test: "start" | "tap" | "done";
};

export const SETUP_KEY = "nailpos.setup.v1";

export const initialSetup = (): SetupState => ({
  stage: "signup",
  salonId: "",
  step: 0,
  ownerName: "",
  ownerPhone: "",
  ownerEmail: "",
  salonName: "",
  salonPhone: "",
  address: "",
  state: "CA",
  hours: defaultHours(),
  svcWay: "tpl",
  website: "",
  svcStage: "choose",
  menu: NAIL_TEMPLATE,
  staff: [],
  stripe: "start",
  reader: "start",
  pairing: "",
  printer: "",
  printed: false,
  device: "Front desk",
  deviceName: "Front desk iPad",
  clients: "",
  test: "start",
});

export type NewStaff = { name: string; phone: string; role: Exclude<Role, "Owner">; pay: PayType };
