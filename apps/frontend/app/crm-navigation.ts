export type CRMEntry = {
  tab: "customers" | "pool" | "tasks" | "opportunities" | "settings";
  customerId?: string;
  personId?: string;
  taskView?: "today" | "week" | "overdue";
  openOnly?: boolean;
};
