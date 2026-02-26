export type ErrorUrgency = 'high' | 'medium' | 'low';

export type ErrorCode = {
  title: string;
  urgency: ErrorUrgency;
  causes: string[];
  steps: string[];
};

export const errorCodes: Record<string, ErrorCode> = {
  OFFLINE: {
    title: 'Machine Offline',
    urgency: 'high',
    causes: ['Power outage', 'Network failure', 'Hardware crash'],
    steps: ['Check power cable', 'Try Remote Reboot button', 'Check Wi-Fi/ethernet router', 'If persists >30min: contact support'],
  },
  TOO_WARM: {
    title: 'Temperature Alert',
    urgency: 'high',
    causes: ['Door not sealed properly', 'Refrigerant issue', 'Ambient temp too high'],
    steps: ['Check door seal', 'Move items blocking vent', 'Try reboot — resets cooling system', 'If persists: dispatch technician'],
  },
  RFID_ERROR: {
    title: 'RFID Reader Issue',
    urgency: 'medium',
    causes: ['Scanner disconnected', 'Antenna cable loose', 'Firmware issue'],
    steps: ['Try Remote Reboot', 'Check antenna connections on next physical visit', 'Run Verify Inventory after recovery'],
  },
  LOW_STOCK: {
    title: 'Low Stock Warning',
    urgency: 'low',
    causes: ['Sales exceeded par level'],
    steps: ['Add machine to next restock route', 'Review par levels if this recurs'],
  },
};
