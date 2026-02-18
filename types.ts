export enum ClientStatus {
  Partner = "Partner",
  Wedding = "Wedding",
  Proposal = "Proposal",
  Birthday = "15 Anos",
}

export interface Client {
  id: string;
  name: string;
  type: ClientStatus;
  date: string; // ISO date string or display string
  email: string;
  phone: string;
  instagram: string;
  initials: string[];
  colors: string[]; // tailwind color classes for initials bg
}

export enum EventStatus {
  Upcoming = "Upcoming",
  Completed = "Completed",
  Cancelled = "Cancelled",
  Booked = "Booked",
}

export interface FinancialItem {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
}

export interface Event {
  id: string;
  title: string;
  clientName: string;
  date: string;
  day: string; // e.g. "02"
  month: string; // e.g. "DEC"
  weekday: string; // e.g. "SATURDAY"
  location: string;
  type: string; // e.g. "Wedding", "Live Painting"
  status: EventStatus;
  income: number;
  expense: number;
  incomeItems: FinancialItem[];
  expenseItems: FinancialItem[];
}

export interface ProposalItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Proposal {
  id: string;
  clientName: string;
  eventDate: string;
  items: ProposalItem[];
  includeTravel: boolean;
  travelDistance: number;
  travelCost: number;
  notes: string;
}
