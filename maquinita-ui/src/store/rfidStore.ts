import { create } from 'zustand'
import { apiGet, apiPost, apiPostForm } from '../lib/api'

export type TransportMode = 'tcp' | 'serial'

export type ConnectionConfig = {
  transport: TransportMode
  host?: string
  port?: number
  device?: string
  baud?: number
  readId: string
  timeout: number
  connectTimeout?: number
}

export type SessionState = {
  connected: boolean
  inventory_running: boolean
  active_transport?: string | null
  read_id?: string | null
  connection?: ConnectionConfig | null
  last_error?: string | null
  operation_in_progress: boolean
  snapshot_count: number
}

export type InventoryRequest = {
  rounds: number
  continuous: boolean
  intervalMs: number
  readPhase: boolean
}

export type SerialPortInfo = {
  device: string
  description: string
  hwid: string
}

export type ReaderSnapshotTag = {
  epc: string
  pc: string
  rssi_dbm: number
  antenna: number
  frequency_mhz: number
  phase?: string | null
  count: number
  updated_at: string
}

export type ReaderSummary = {
  read_id: number
  firmware?: string | null
  temperature_c?: number | null
  identifier_hex?: string | null
  output_power: number[]
}

export type AccessMatchResult = {
  enabled: boolean
  epc_hex?: string | null
}

export type TagOperationResult = Record<string, unknown>
export type NetPortPacket = Record<string, unknown>
export type InventorySummary = Record<string, unknown>
export type CfgResult = Record<string, unknown>
export type LogEntry = { direction: string; hex: string; timestamp: string }

export type Capabilities = {
  serial_supported: boolean
  serial_ports_detected: SerialPortInfo[]
  transports: TransportMode[]
  actions: Record<string, boolean>
}

type LiveEvent = {
  type: 'connection' | 'inventory_tag' | 'inventory_summary' | 'log' | 'error' | 'netport_scan_result'
  timestamp: string | null
  payload: Record<string, unknown>
}

type RfidStore = {
  capabilities: Capabilities | null
  session: SessionState
  serialPorts: SerialPortInfo[]
  tags: ReaderSnapshotTag[]
  inventorySummary: InventorySummary | null
  readerSummary: ReaderSummary | null
  accessMatch: AccessMatchResult | null
  tagResult: TagOperationResult | null
  netScanResults: NetPortPacket[]
  netPacket: NetPortPacket | null
  cfgResult: CfgResult | null
  logs: LogEntry[]
  statusMessage: string | null
  errorMessage: string | null
  busyAction: string | null
  liveConnected: boolean
  socket: WebSocket | null
  socketReconnectWanted: boolean
  bootstrap: () => Promise<void>
  openLiveSocket: () => void
  closeLiveSocket: () => void
  clearMessages: () => void
  refreshCapabilities: () => Promise<void>
  refreshSerialPorts: () => Promise<void>
  refreshSession: () => Promise<void>
  connect: (config: ConnectionConfig) => Promise<SessionState>
  disconnect: () => Promise<SessionState>
  fetchReaderSessionInfo: () => Promise<ReaderSummary>
  fetchFirmware: () => Promise<{ firmware: string }>
  fetchTemperature: () => Promise<{ temperature_c: number }>
  fetchIdentifier: () => Promise<{ identifier_hex: string }>
  fetchOutputPower: () => Promise<{ output_power: number[] }>
  startInventory: (request: InventoryRequest) => Promise<SessionState>
  stopInventory: () => Promise<SessionState>
  refreshSnapshot: () => Promise<void>
  readTag: (payload: Record<string, unknown>) => Promise<TagOperationResult>
  writeTag: (payload: Record<string, unknown>) => Promise<TagOperationResult>
  lockTag: (payload: Record<string, unknown>) => Promise<TagOperationResult>
  killTag: (payload: Record<string, unknown>) => Promise<TagOperationResult>
  getAccessMatch: () => Promise<AccessMatchResult>
  setAccessMatch: (payload: Record<string, unknown>) => Promise<AccessMatchResult>
  clearAccessMatch: () => Promise<AccessMatchResult>
  scanNetPort: (payload: Record<string, unknown>) => Promise<NetPortPacket[]>
  getNetPort: (payload: Record<string, unknown>) => Promise<NetPortPacket>
  setNetPort: (payload: Record<string, unknown>) => Promise<NetPortPacket>
  resetNetPort: (payload: Record<string, unknown>) => Promise<NetPortPacket>
  defaultNetPort: (payload: Record<string, unknown>) => Promise<NetPortPacket>
  decodeCfg: (hex?: string, file?: File | null) => Promise<CfgResult>
  encodeCfg: (payload: Record<string, unknown>) => Promise<{ hex: string; byte_length: number }>
  refreshLogs: () => Promise<void>
}

export const CONNECTION_PROFILE_KEY = 'maquinita.rfid.connection'

export const defaultConnectionProfile: ConnectionConfig = {
  transport: 'tcp',
  host: '192.168.1.116',
  port: 4001,
  device: '',
  baud: 115200,
  readId: 'FF',
  timeout: 3,
  connectTimeout: 2,
}

export const defaultInventoryRequest: InventoryRequest = {
  rounds: 1,
  continuous: true,
  intervalMs: 400,
  readPhase: false,
}

export function loadConnectionProfile(): ConnectionConfig {
  if (typeof window === 'undefined') {
    return defaultConnectionProfile
  }
  const raw = window.localStorage.getItem(CONNECTION_PROFILE_KEY)
  if (!raw) {
    return defaultConnectionProfile
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConnectionConfig>
    return { ...defaultConnectionProfile, ...parsed }
  } catch {
    return defaultConnectionProfile
  }
}

export function saveConnectionProfile(profile: ConnectionConfig): void {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(CONNECTION_PROFILE_KEY, JSON.stringify(profile))
}

const defaultSessionState: SessionState = {
  connected: false,
  inventory_running: false,
  active_transport: null,
  read_id: null,
  connection: null,
  last_error: null,
  operation_in_progress: false,
  snapshot_count: 0,
}

function upsertTag(list: ReaderSnapshotTag[], next: ReaderSnapshotTag): ReaderSnapshotTag[] {
  const index = list.findIndex((item) => item.epc === next.epc)
  if (index === -1) {
    return [next, ...list].sort((a, b) => b.count - a.count || a.epc.localeCompare(b.epc))
  }

  const cloned = [...list]
  cloned[index] = next
  return cloned.sort((a, b) => b.count - a.count || a.epc.localeCompare(b.epc))
}

function upsertNetScanResult(list: NetPortPacket[], next: NetPortPacket): NetPortPacket[] {
  const sourceIp = String(next.source_ip ?? '')
  const deviceMac = String(next.device_mac ?? '')
  const index = list.findIndex((item) => item.source_ip === sourceIp || item.device_mac === deviceMac)
  if (index === -1) {
    return [next, ...list]
  }
  const cloned = [...list]
  cloned[index] = next
  return cloned
}

function websocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/rfid/live`
}

export const useRfidStore = create<RfidStore>((set, get) => {
  const runTracked = async <T>(label: string, task: () => Promise<T>, successMessage?: string): Promise<T> => {
    set({ busyAction: label, errorMessage: null })
    try {
      const result = await task()
      set({ statusMessage: successMessage ?? null })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Operacion RFID fallida'
      set({ errorMessage: message, statusMessage: null })
      throw error
    } finally {
      set({ busyAction: null })
    }
  }

  const mergeReaderSummary = (patch: Partial<ReaderSummary>) => {
    const current = get().readerSummary
    set({
      readerSummary: {
        read_id: current?.read_id ?? Number.parseInt(get().session.read_id ?? '255', 16),
        firmware: current?.firmware ?? null,
        temperature_c: current?.temperature_c ?? null,
        identifier_hex: current?.identifier_hex ?? null,
        output_power: current?.output_power ?? [],
        ...patch,
      },
    })
  }

  const handleLiveEvent = (message: LiveEvent) => {
    if (message.type === 'connection') {
      const payload = message.payload as Partial<SessionState> & { connected?: boolean; inventory_running?: boolean }
      set((state) => ({
        session: {
          ...state.session,
          ...payload,
          connected: payload.connected ?? state.session.connected,
          inventory_running: payload.inventory_running ?? state.session.inventory_running,
          last_error: state.errorMessage ?? state.session.last_error,
        },
      }))
      return
    }

    if (message.type === 'inventory_tag') {
      const payload = message.payload as unknown as ReaderSnapshotTag
      set((state) => ({
        tags: upsertTag(state.tags, payload),
        session: { ...state.session, snapshot_count: Math.max(state.session.snapshot_count, state.tags.length + 1) },
      }))
      return
    }

    if (message.type === 'inventory_summary') {
      set({ inventorySummary: message.payload })
      return
    }

    if (message.type === 'log') {
      const payload = message.payload as unknown as LogEntry
      set((state) => ({ logs: [payload, ...state.logs].slice(0, 400) }))
      return
    }

    if (message.type === 'netport_scan_result') {
      set((state) => ({ netScanResults: upsertNetScanResult(state.netScanResults, message.payload) }))
      return
    }

    if (message.type === 'error') {
      const messageText = typeof message.payload.message === 'string' ? message.payload.message : 'Error RFID'
      set((state) => ({ errorMessage: messageText, session: { ...state.session, last_error: messageText } }))
    }
  }

  return {
    capabilities: null,
    session: defaultSessionState,
    serialPorts: [],
    tags: [],
    inventorySummary: null,
    readerSummary: null,
    accessMatch: null,
    tagResult: null,
    netScanResults: [],
    netPacket: null,
    cfgResult: null,
    logs: [],
    statusMessage: null,
    errorMessage: null,
    busyAction: null,
    liveConnected: false,
    socket: null,
    socketReconnectWanted: false,

    bootstrap: async () => {
      await Promise.all([
        get().refreshCapabilities(),
        get().refreshSerialPorts(),
        get().refreshSession(),
        get().refreshLogs(),
      ])
      await get().refreshSnapshot()
    },

    openLiveSocket: () => {
      const existing = get().socket
      if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
        return
      }

      const socket = new WebSocket(websocketUrl())
      set({ socket, socketReconnectWanted: true })

      socket.addEventListener('open', () => {
        set({ liveConnected: true })
      })

      socket.addEventListener('message', (event) => {
        try {
          handleLiveEvent(JSON.parse(event.data) as LiveEvent)
        } catch {
          set({ errorMessage: 'No se pudo interpretar un evento del websocket RFID' })
        }
      })

      socket.addEventListener('close', () => {
        set({ liveConnected: false, socket: null })
        if (get().socketReconnectWanted) {
          window.setTimeout(() => {
            if (!get().socket && get().socketReconnectWanted) {
              get().openLiveSocket()
            }
          }, 1500)
        }
      })

      socket.addEventListener('error', () => {
        set({ liveConnected: false })
      })
    },

    closeLiveSocket: () => {
      const socket = get().socket
      set({ socketReconnectWanted: false, liveConnected: false, socket: null })
      socket?.close()
    },

    clearMessages: () => set({ statusMessage: null, errorMessage: null }),

    refreshCapabilities: async () => {
      const capabilities = await apiGet<Capabilities>('/api/v1/rfid/capabilities')
      set({ capabilities })
    },

    refreshSerialPorts: async () => {
      const serialPorts = await apiGet<SerialPortInfo[]>('/api/v1/rfid/serial/ports')
      set({ serialPorts })
    },

    refreshSession: async () => {
      const session = await apiGet<SessionState>('/api/v1/rfid/session/state')
      set({ session })
    },

    connect: async (config) => runTracked('Conectando lector', async () => {
      const session = await apiPost<SessionState>('/api/v1/rfid/session/connect', config)
      saveConnectionProfile(config)
      set({ session, tags: [], inventorySummary: null })
      return session
    }, 'Lector conectado'),

    disconnect: async () => runTracked('Cerrando sesion', async () => {
      const session = await apiPost<SessionState>('/api/v1/rfid/session/disconnect')
      set({ session, tags: [], inventorySummary: null, readerSummary: null, accessMatch: null, tagResult: null })
      return session
    }, 'Sesion RFID desconectada'),

    fetchReaderSessionInfo: async () => runTracked('Leyendo resumen del lector', async () => {
      const summary = await apiPost<ReaderSummary>('/api/v1/rfid/reader/session-info')
      set({ readerSummary: summary })
      return summary
    }, 'Resumen del lector actualizado'),

    fetchFirmware: async () => runTracked('Leyendo firmware', async () => {
      const response = await apiPost<{ firmware: string }>('/api/v1/rfid/reader/firmware')
      mergeReaderSummary({ firmware: response.firmware })
      return response
    }),

    fetchTemperature: async () => runTracked('Leyendo temperatura', async () => {
      const response = await apiPost<{ temperature_c: number }>('/api/v1/rfid/reader/temperature')
      mergeReaderSummary({ temperature_c: response.temperature_c })
      return response
    }),

    fetchIdentifier: async () => runTracked('Leyendo identifier', async () => {
      const response = await apiPost<{ identifier_hex: string }>('/api/v1/rfid/reader/identifier')
      mergeReaderSummary({ identifier_hex: response.identifier_hex })
      return response
    }),

    fetchOutputPower: async () => runTracked('Leyendo potencia', async () => {
      const response = await apiPost<{ output_power: number[] }>('/api/v1/rfid/reader/output-power/get')
      mergeReaderSummary({ output_power: response.output_power })
      return response
    }),

    startInventory: async (request) => runTracked('Iniciando inventario', async () => {
      const session = await apiPost<SessionState>('/api/v1/rfid/inventory/start', request)
      set({ session, tags: [], inventorySummary: null })
      return session
    }, 'Inventario iniciado'),

    stopInventory: async () => runTracked('Deteniendo inventario', async () => {
      const session = await apiPost<SessionState>('/api/v1/rfid/inventory/stop')
      set({ session })
      return session
    }, 'Inventario detenido'),

    refreshSnapshot: async () => {
      const tags = await apiGet<ReaderSnapshotTag[]>('/api/v1/rfid/inventory/snapshot')
      set((state) => ({ tags, session: { ...state.session, snapshot_count: tags.length } }))
    },

    readTag: async (payload) => runTracked('Leyendo memoria del tag', async () => {
      const result = await apiPost<TagOperationResult>('/api/v1/rfid/tag/read', payload)
      set({ tagResult: result })
      return result
    }, 'Lectura de tag completada'),

    writeTag: async (payload) => runTracked('Escribiendo tag', async () => {
      const result = await apiPost<TagOperationResult>('/api/v1/rfid/tag/write', payload)
      set({ tagResult: result })
      return result
    }, 'Escritura enviada al lector'),

    lockTag: async (payload) => runTracked('Bloqueando tag', async () => {
      const result = await apiPost<TagOperationResult>('/api/v1/rfid/tag/lock', payload)
      set({ tagResult: result })
      return result
    }, 'Comando de bloqueo enviado'),

    killTag: async (payload) => runTracked('Matando tag', async () => {
      const result = await apiPost<TagOperationResult>('/api/v1/rfid/tag/kill', payload)
      set({ tagResult: result })
      return result
    }, 'Comando kill enviado'),

    getAccessMatch: async () => runTracked('Leyendo filtro EPC', async () => {
      const result = await apiPost<AccessMatchResult>('/api/v1/rfid/tag/access-match/get')
      set({ accessMatch: result })
      return result
    }),

    setAccessMatch: async (payload) => runTracked('Guardando filtro EPC', async () => {
      const result = await apiPost<AccessMatchResult>('/api/v1/rfid/tag/access-match/set', payload)
      set({ accessMatch: result })
      return result
    }, 'Filtro EPC actualizado'),

    clearAccessMatch: async () => runTracked('Limpiando filtro EPC', async () => {
      const result = await apiPost<AccessMatchResult>('/api/v1/rfid/tag/access-match/clear')
      set({ accessMatch: result })
      return result
    }, 'Filtro EPC desactivado'),

    scanNetPort: async (payload) => runTracked('Escaneando NetPort', async () => {
      const results = await apiPost<NetPortPacket[]>('/api/v1/rfid/netport/scan', payload)
      set({ netScanResults: results })
      return results
    }, 'Escaneo NetPort completado'),

    getNetPort: async (payload) => runTracked('Leyendo configuracion NetPort', async () => {
      const packet = await apiPost<NetPortPacket>('/api/v1/rfid/netport/get', payload)
      set({ netPacket: packet })
      return packet
    }),

    setNetPort: async (payload) => runTracked('Guardando configuracion NetPort', async () => {
      const packet = await apiPost<NetPortPacket>('/api/v1/rfid/netport/set', payload)
      set({ netPacket: packet })
      return packet
    }, 'Configuracion NetPort enviada'),

    resetNetPort: async (payload) => runTracked('Reiniciando NetPort', async () => {
      const packet = await apiPost<NetPortPacket>('/api/v1/rfid/netport/reset', payload)
      set({ netPacket: packet })
      return packet
    }, 'Reset NetPort enviado'),

    defaultNetPort: async (payload) => runTracked('Restaurando defaults NetPort', async () => {
      const packet = await apiPost<NetPortPacket>('/api/v1/rfid/netport/default', payload)
      set({ netPacket: packet })
      return packet
    }, 'Defaults NetPort enviados'),

    decodeCfg: async (hex, file) => runTracked('Decodificando CFG', async () => {
      const formData = new FormData()
      if (file) {
        formData.append('file', file)
      }
      if (hex) {
        formData.append('hex', hex)
      }
      const result = await apiPostForm<CfgResult>('/api/v1/rfid/netport/cfg/decode', formData)
      set({ cfgResult: result })
      return result
    }, 'CFG decodificado'),

    encodeCfg: async (payload) => runTracked('Codificando CFG', async () => {
      const result = await apiPost<{ hex: string; byte_length: number }>('/api/v1/rfid/netport/cfg/encode', payload)
      set({ cfgResult: result })
      return result
    }, 'CFG listo para exportar'),

    refreshLogs: async () => {
      const logs = await apiGet<LogEntry[]>('/api/v1/rfid/logs')
      set({ logs })
    },
  }
})
