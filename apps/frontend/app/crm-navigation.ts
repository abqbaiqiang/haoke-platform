export type CRMEntry = {
  tab: "tasks" | "opportunities";
  personId: string;
  taskView?: "today" | "week" | "overdue";
  openOnly?: boolean;
};
