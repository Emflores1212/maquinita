export type MachineListItem = {
  id: string;
  operator_id: string;
  name: string;
  mid: string;
  type: 'fridge' | 'pantry' | 'freezer';
  location_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
  temperature: number | null;
  last_seen_at: string | null;
  notes: string | null;
  settings: Record<string, unknown> | null;
  todayRevenue: number;
};

export type MachineDetailData = {
  id: string;
  name: string;
  mid: string;
  type: 'fridge' | 'pantry' | 'freezer';
  location_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: string | null;
  temperature: number | null;
  last_seen_at: string | null;
  notes: string | null;
  settings: Record<string, unknown> | null;
};

export type DriverProfile = {
  id: string;
  full_name: string | null;
  assigned_machine_ids: string[] | null;
};

export type MachineAlert = {
  id: string;
  type: string;
  message: string | null;
  severity: string | null;
  created_at: string | null;
  resolved_at: string | null;
};
