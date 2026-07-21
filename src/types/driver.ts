export interface Driver {
  id: string;
  name: string;
  active: boolean;
  sort_order: number | null;
  created_at: string;
}
