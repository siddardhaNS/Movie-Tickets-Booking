export type SeatClass = { key: string; name: string; defaultPricePaise: number };
export type Slot = { key: string; label: string; time: string }; // time is HH:MM in the theatre's timezone

export type LayoutRow = { r: string; cls: string; n: number; off: number[] };
export type Layout = LayoutRow[];

export type Prices = Record<string, number>; // class key -> paise

export type OrgSettings = {
  codePrefix: string;          // two letters printed at the start of every booking code
  slots: Slot[];
  classes: SeatClass[];
  bookingFeePaise: number;     // per seat, online only
  gstRate: number;             // charged on the booking fee
  maxSeats: number;            // per booking
  holdMinutes: number;         // online checkout hold
  counterHoldMinutes: number;  // box office cart hold
  defaultBlocked: Record<string, string>; // seat -> reason, applied to every new show
  style?: 'marquee' | 'poster' | 'calm';  // look of the public site and consoles
};

export type Role = 'owner' | 'manager' | 'boxoffice' | 'gate';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', manager: 'Manager', boxoffice: 'Box office', gate: 'Gate',
};

export type SeatState = 'available' | 'taken' | 'blocked' | 'mine';
