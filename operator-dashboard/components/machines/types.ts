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

export type TeamMemberProfile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'manager' | 'driver' | 'viewer' | null;
  assigned_machine_ids: string[] | null;
};

export type MachineAlertPreference = {
  id: string;
  machine_id: string;
  user_id: string;
  alert_type: 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK';
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
  delay_minutes: number;
};

export type TemperatureReadingPoint = {
  id: string;
  temperature: number;
  recorded_at: string | null;
};

export type MachineCommandHistoryItem = {
  id: string;
  machine_id: string;
  issued_by: string | null;
  type: 'LOCKDOWN' | 'UNLOCK' | 'REBOOT' | 'TEMP_ADJUST';
  status: 'pending' | 'acknowledged' | 'executed' | 'failed';
  issued_at: string;
  acknowledged_at: string | null;
  executed_at: string | null;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  issued_by_name?: string | null;
};

export type MachineAlert = {
  id: string;
  type: string;
  message: string | null;
  severity: string | null;
  created_at: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
};
