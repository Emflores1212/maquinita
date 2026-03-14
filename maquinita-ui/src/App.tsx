import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './index.css'
import {
  defaultConnectionProfile,
  defaultInventoryRequest,
  loadConnectionProfile,
  saveConnectionProfile,
  useRfidStore,
} from './store/rfidStore'
import type { ConnectionConfig, InventoryRequest } from './store/rfidStore'

type TabId = 'conexion' | 'lector' | 'inventario' | 'tag' | 'netport' | 'cfg'
type Tone = 'neutral' | 'success' | 'warning' | 'danger'

type ConfirmState = {
  title: string
  description: string
  tone: Tone
  action: () => Promise<void>
}

type DeviceHwConfig = {
  dev_type: number
  aux_dev_type: number
  index: number
  hardware_version: number
  software_version: number
  module_name: string
  mac: string
  ip: string
  gateway: string
  subnet_mask: string
  dhcp_enabled: boolean
  web_port: number
  username: string
  password_enabled: boolean
  password: string
  update_flag: boolean
  serial_config_enabled: boolean
}

type DevicePortConfig = {
  index: number
  enabled: boolean
  net_mode: number
  random_source_port: boolean
  net_port: number
  destination_ip: string
  destination_port: number
  baudrate: number
  data_bits: number
  stop_bits: number
  parity: number
  phy_disconnect_handle: boolean
  rx_packet_length: number
  rx_packet_timeout: number
  reconnect_count: number
  reset_ctrl: boolean
  dns_enabled: boolean
  domain_name: string
  dns_host_ip: string
  dns_host_port: number
}

const tabs: Array<{ id: TabId; label: string; help: string }> = [
  { id: 'conexion', label: 'Conexión', help: 'Abrir sesión TCP o serial y recordar el último perfil.' },
  { id: 'lector', label: 'Lector', help: 'Consultar estado base del reader: firmware, temperatura, ID y potencia.' },
  { id: 'inventario', label: 'Inventario', help: 'Correr inventory simple o continuo y exportar EPCs.' },
  { id: 'tag', label: 'Operaciones Tag', help: 'Leer, escribir, bloquear, matar y filtrar EPC.' },
  { id: 'netport', label: 'NetPort', help: 'Descubrir, leer y modificar la configuración de red del módulo.' },
  { id: 'cfg', label: 'CFG / Logs', help: 'Decodificar .cfg, exportar configuración y revisar TX/RX en hex.' },
]

const defaultHwConfig = (): DeviceHwConfig => ({
  dev_type: 1,
  aux_dev_type: 0,
  index: 0,
  hardware_version: 1,
  software_version: 1,
  module_name: 'NETPORT',
  mac: '00:11:22:33:44:55',
  ip: '192.168.1.200',
  gateway: '192.168.1.1',
  subnet_mask: '255.255.255.0',
  dhcp_enabled: false,
  web_port: 80,
  username: 'admin',
  password_enabled: false,
  password: 'admin',
  update_flag: false,
  serial_config_enabled: true,
})

const defaultPortConfig = (index: number): DevicePortConfig => ({
  index,
  enabled: index === 0,
  net_mode: 0,
  random_source_port: false,
  net_port: 4001 + index,
  destination_ip: '192.168.1.50',
  destination_port: 4001 + index,
  baudrate: 115200,
  data_bits: 8,
  stop_bits: 1,
  parity: 0,
  phy_disconnect_handle: false,
  rx_packet_length: 0,
  rx_packet_timeout: 0,
  reconnect_count: 0,
  reset_ctrl: false,
  dns_enabled: false,
  domain_name: '',
  dns_host_ip: '0.0.0.0',
  dns_host_port: 0,
})

const netModeLabels: Record<number, string> = {
  0: 'TCP Server',
  1: 'TCP Client',
  2: 'UDP',
  3: 'UDP Multicast',
}

const memBankLabels = [
  { value: 0, label: '0 · Reserved' },
  { value: 1, label: '1 · EPC' },
  { value: 2, label: '2 · TID' },
  { value: 3, label: '3 · User' },
]

const lockTypeLabels = [
  { value: 0, label: 'Unlock' },
  { value: 1, label: 'Permanent Unlock' },
  { value: 2, label: 'Lock' },
  { value: 3, label: 'Permanent Lock' },
]

function isHex(value: string): boolean {
  const cleaned = value.replace(/0x/gi, '').replace(/[^a-fA-F0-9]/g, '')
  return cleaned.length > 0 && cleaned.length % 2 === 0 && /^[a-fA-F0-9]+$/.test(cleaned)
}

function normalizeHex(value: string): string {
  return value.replace(/0x/gi, '').replace(/[^a-fA-F0-9]/g, '').toUpperCase()
}

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2)
}

function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function SectionCard(props: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }): ReactNode {
  return (
    <section className="panel-card">
      <header className="panel-card__header">
        <div>
          <p className="eyebrow">Panel</p>
          <h2>{props.title}</h2>
          {props.subtitle ? <p className="panel-card__subtitle">{props.subtitle}</p> : null}
        </div>
        {props.actions ? <div className="panel-card__actions">{props.actions}</div> : null}
      </header>
      <div className="panel-card__body">{props.children}</div>
    </section>
  )
}

function Label(props: { title: string; note?: string; children: ReactNode }): ReactNode {
  return (
    <label className="field">
      <span className="field__label">{props.title}</span>
      {props.note ? <span className="field__note">{props.note}</span> : null}
      {props.children}
    </label>
  )
}

function Metric(props: { label: string; value: ReactNode; tone?: Tone }): ReactNode {
  return (
    <div className={`metric metric--${props.tone ?? 'neutral'}`}>
      <span className="metric__label">{props.label}</span>
      <strong className="metric__value">{props.value}</strong>
    </div>
  )
}

function StatusPill(props: { label: string; value: ReactNode; tone?: Tone }): ReactNode {
  return (
    <div className={`status-pill status-pill--${props.tone ?? 'neutral'}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  )
}

function JsonPanel(props: { title: string; data: unknown }): ReactNode {
  return (
    <div className="json-panel">
      <div className="json-panel__title">{props.title}</div>
      <pre>{formatJson(props.data)}</pre>
    </div>
  )
}

function App() {
  const {
    capabilities,
    session,
    serialPorts,
    tags,
    inventorySummary,
    readerSummary,
    accessMatch,
    tagResult,
    netScanResults,
    netPacket,
    cfgResult,
    logs,
    statusMessage,
    errorMessage,
    busyAction,
    liveConnected,
    bootstrap,
    openLiveSocket,
    closeLiveSocket,
    clearMessages,
    refreshSerialPorts,
    connect,
    disconnect,
    fetchReaderSessionInfo,
    fetchFirmware,
    fetchTemperature,
    fetchIdentifier,
    fetchOutputPower,
    startInventory,
    stopInventory,
    refreshSnapshot,
    readTag,
    writeTag,
    lockTag,
    killTag,
    getAccessMatch,
    setAccessMatch,
    clearAccessMatch,
    scanNetPort,
    getNetPort,
    setNetPort,
    resetNetPort,
    defaultNetPort,
    decodeCfg,
    encodeCfg,
    refreshLogs,
  } = useRfidStore()

  const [activeTab, setActiveTab] = useState<TabId>('conexion')
  const [connectionForm, setConnectionForm] = useState<ConnectionConfig>(() => loadConnectionProfile())
  const [inventoryForm, setInventoryForm] = useState<InventoryRequest>(defaultInventoryRequest)
  const [epcFilter, setEpcFilter] = useState('')
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [tagReadForm, setTagReadForm] = useState({ passwordHex: '00000000', memBank: 1, wordAddress: 2, wordCount: 6 })
  const [tagWriteForm, setTagWriteForm] = useState({ passwordHex: '00000000', memBank: 1, wordAddress: 2, wordCount: 6, dataHex: '300833B2DDD9014000000000' })
  const [tagLockForm, setTagLockForm] = useState({ passwordHex: '00000000', memBank: 1, lockType: 2 })
  const [tagKillForm, setTagKillForm] = useState({ passwordHex: '00000000' })
  const [accessMatchForm, setAccessMatchForm] = useState({ epcHex: '', mode: 0 })
  const [scanForm, setScanForm] = useState({ bindIp: '0.0.0.0', seconds: 3 })
  const [netGetForm, setNetGetForm] = useState({ bindIp: '0.0.0.0', deviceMac: '11:22:33:44:55:66', timeout: 3, pcMac: 'AA:BB:CC:DD:EE:FF' })
  const [hwConfig, setHwConfig] = useState<DeviceHwConfig>(defaultHwConfig)
  const [port0, setPort0] = useState<DevicePortConfig>(() => defaultPortConfig(0))
  const [port1, setPort1] = useState<DevicePortConfig>(() => defaultPortConfig(1))
  const [cfgHexInput, setCfgHexInput] = useState('')
  const [cfgFile, setCfgFile] = useState<File | null>(null)
  const [encodedCfgHex, setEncodedCfgHex] = useState('')

  useEffect(() => {
    void bootstrap()
    openLiveSocket()

    return () => {
      closeLiveSocket()
    }
  }, [bootstrap, closeLiveSocket, openLiveSocket])

  useEffect(() => {
    if (session.connection) {
      setConnectionForm({ ...defaultConnectionProfile, ...session.connection })
    }
  }, [session.connection])

  const filteredTags = useMemo(() => {
    const needle = epcFilter.trim().toUpperCase()
    if (!needle) {
      return tags
    }
    return tags.filter((tag) => tag.epc.toUpperCase().includes(needle))
  }, [epcFilter, tags])

  const currentTransport = session.connection?.transport ?? connectionForm.transport
  const endpointLabel = currentTransport === 'tcp'
    ? `${session.connection?.host ?? connectionForm.host ?? 'sin host'}:${session.connection?.port ?? connectionForm.port ?? 4001}`
    : `${session.connection?.device ?? connectionForm.device ?? 'sin puerto'} @ ${session.connection?.baud ?? connectionForm.baud ?? 115200}`

  const applyNetPacket = (packet: Record<string, unknown>) => {
    const deviceMac = typeof packet.device_mac === 'string' ? packet.device_mac : netGetForm.deviceMac
    const pcMac = typeof packet.pc_mac === 'string' ? packet.pc_mac : netGetForm.pcMac
    setNetGetForm((current) => ({ ...current, deviceMac, pcMac }))
    if (packet.hw_config && typeof packet.hw_config === 'object') {
      setHwConfig(packet.hw_config as DeviceHwConfig)
    }
    if (packet.port0 && typeof packet.port0 === 'object') {
      setPort0(packet.port0 as DevicePortConfig)
    }
    if (packet.port1 && typeof packet.port1 === 'object') {
      setPort1(packet.port1 as DevicePortConfig)
    }
  }

  const handleConnect = async (event: FormEvent) => {
    event.preventDefault()
    await connect(connectionForm)
    saveConnectionProfile(connectionForm)
  }

  const requireHex = (label: string, value: string) => {
    if (!isHex(value)) {
      throw new Error(`${label} debe estar en hex y con longitud par`)
    }
  }

  const withConfirmation = (title: string, description: string, tone: Tone, action: () => Promise<void>) => {
    setConfirm({ title, description, tone, action })
  }

  const buildNetPayload = () => ({
    bindIp: netGetForm.bindIp,
    deviceMac: netGetForm.deviceMac,
    pcMac: netGetForm.pcMac,
    timeout: netGetForm.timeout,
    hwConfig,
    port0,
    port1,
  })

  const handleExportJson = () => {
    downloadText(`rfid-inventory-${new Date().toISOString()}.json`, formatJson(filteredTags), 'application/json')
  }

  const handleExportCsv = () => {
    const rows = [
      ['epc', 'pc', 'rssi_dbm', 'antenna', 'frequency_mhz', 'phase', 'count', 'updated_at'],
      ...filteredTags.map((tag) => [
        tag.epc,
        tag.pc,
        String(tag.rssi_dbm),
        String(tag.antenna),
        String(tag.frequency_mhz),
        tag.phase ?? '',
        String(tag.count),
        tag.updated_at,
      ]),
    ]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    downloadText(`rfid-inventory-${new Date().toISOString()}.csv`, csv, 'text/csv;charset=utf-8')
  }

  return (
    <div className="shell">
      <div className="shell__backdrop" />
      <main className="app-frame">
        <header className="hero">
          <div>
            <p className="eyebrow">Consola Web RFID</p>
            <h1>Mac y Raspberry Pi 5, misma base operativa</h1>
            <p className="hero__copy">
              UI técnica para lector RFID, con control del reader, operaciones de tags, descubrimiento NetPort y decodificación CFG.
            </p>
          </div>
          <div className="hero__meta">
            <StatusPill label="Sesión" value={session.connected ? 'Conectada' : 'Desconectada'} tone={session.connected ? 'success' : 'warning'} />
            <StatusPill label="WebSocket" value={liveConnected ? 'Vivo' : 'Reconectando'} tone={liveConnected ? 'success' : 'warning'} />
            <StatusPill label="Modo" value={currentTransport.toUpperCase()} />
            <StatusPill label="Destino" value={endpointLabel} />
            <StatusPill label="Read ID" value={session.read_id ?? connectionForm.readId} />
            <StatusPill label="Operación" value={busyAction ?? 'Idle'} tone={busyAction ? 'warning' : 'neutral'} />
          </div>
        </header>

        <section className="message-strip">
          {statusMessage ? <div className="banner banner--success">{statusMessage}</div> : null}
          {errorMessage ? <div className="banner banner--danger">{errorMessage}</div> : null}
          {session.last_error && !errorMessage ? <div className="banner banner--warning">{session.last_error}</div> : null}
          {!statusMessage && !errorMessage && !session.last_error ? (
            <div className="banner banner--neutral">
              {capabilities?.serial_supported ? 'Serial disponible en este entorno.' : 'Serial no detectado; TCP sigue disponible.'}
            </div>
          ) : null}
          {(statusMessage || errorMessage || session.last_error) ? (
            <button className="ghost-button" onClick={() => clearMessages()} type="button">
              Limpiar mensajes
            </button>
          ) : null}
        </section>

        <nav className="tab-bar" aria-label="Secciones RFID">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab ${activeTab === tab.id ? 'tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.help}</small>
            </button>
          ))}
        </nav>

        {activeTab === 'conexion' ? (
          <div className="panel-grid panel-grid--two">
            <SectionCard
              title="Perfil de conexión"
              subtitle="Abrir y cerrar sesión sin usar terminal. El último perfil se guarda localmente."
              actions={(
                <div className="button-row">
                  <button className="button button--primary" onClick={handleConnect} type="button" disabled={!!busyAction}>
                    Conectar
                  </button>
                  <button className="button button--ghost" onClick={() => void disconnect()} type="button" disabled={!session.connected}>
                    Desconectar
                  </button>
                </div>
              )}
            >
              <form className="form-grid" onSubmit={handleConnect}>
                <Label title="Transporte">
                  <select value={connectionForm.transport} onChange={(event) => setConnectionForm((current) => ({ ...current, transport: event.target.value as ConnectionConfig['transport'] }))}>
                    <option value="tcp">TCP</option>
                    <option value="serial">Serial</option>
                  </select>
                </Label>
                <Label title="Read ID" note="Hex de 1 byte, normalmente FF.">
                  <input value={connectionForm.readId} onChange={(event) => setConnectionForm((current) => ({ ...current, readId: event.target.value.toUpperCase() }))} maxLength={2} />
                </Label>
                {connectionForm.transport === 'tcp' ? (
                  <>
                    <Label title="Host / IP">
                      <input value={connectionForm.host ?? ''} onChange={(event) => setConnectionForm((current) => ({ ...current, host: event.target.value }))} placeholder="192.168.1.116" />
                    </Label>
                    <Label title="Puerto TCP">
                      <input type="number" value={connectionForm.port ?? 4001} onChange={(event) => setConnectionForm((current) => ({ ...current, port: Number(event.target.value) }))} />
                    </Label>
                  </>
                ) : (
                  <>
                    <Label title="Puerto serial">
                      <input list="serial-port-list" value={connectionForm.device ?? ''} onChange={(event) => setConnectionForm((current) => ({ ...current, device: event.target.value }))} placeholder="/dev/tty.usbserial-0001" />
                      <datalist id="serial-port-list">
                        {serialPorts.map((port) => (
                          <option key={port.device} value={port.device}>{`${port.device} · ${port.description}`}</option>
                        ))}
                      </datalist>
                    </Label>
                    <Label title="Baud rate">
                      <input type="number" value={connectionForm.baud ?? 115200} onChange={(event) => setConnectionForm((current) => ({ ...current, baud: Number(event.target.value) }))} />
                    </Label>
                  </>
                )}
                <Label title="Timeout (s)">
                  <input type="number" step="0.1" value={connectionForm.timeout} onChange={(event) => setConnectionForm((current) => ({ ...current, timeout: Number(event.target.value) }))} />
                </Label>
                <Label title="Connect timeout (s)">
                  <input type="number" step="0.1" value={connectionForm.connectTimeout ?? 2} onChange={(event) => setConnectionForm((current) => ({ ...current, connectTimeout: Number(event.target.value) }))} />
                </Label>
              </form>
            </SectionCard>

            <SectionCard
              title="Puertos seriales detectados"
              subtitle="Refresca este panel antes de elegir un dispositivo USB-serial."
              actions={(
                <button className="button button--ghost" onClick={() => void refreshSerialPorts()} type="button">
                  Buscar puertos
                </button>
              )}
            >
              <div className="stack-list">
                {serialPorts.length === 0 ? <p className="muted">No hay puertos seriales detectados por la API.</p> : null}
                {serialPorts.map((port) => (
                  <div key={port.device} className="list-row" onClick={() => setConnectionForm((current) => ({ ...current, transport: 'serial', device: port.device }))}>
                    <strong>{port.device}</strong>
                    <span>{port.description}</span>
                    <small>{port.hwid}</small>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'lector' ? (
          <div className="panel-grid">
            <SectionCard
              title="Resumen del lector"
              subtitle="Consulta rápida de los datos esenciales del reader conectado."
              actions={(
                <div className="button-row">
                  <button className="button button--primary" onClick={() => void fetchReaderSessionInfo()} type="button" disabled={!session.connected}>
                    Leer resumen
                  </button>
                  <button className="button button--ghost" onClick={() => void fetchOutputPower()} type="button" disabled={!session.connected}>
                    Potencia
                  </button>
                </div>
              )}
            >
              <div className="metrics-grid">
                <Metric label="Firmware" value={readerSummary?.firmware ?? 'Sin leer'} tone="success" />
                <Metric label="Temperatura" value={readerSummary?.temperature_c != null ? `${readerSummary.temperature_c} °C` : 'Sin leer'} tone="neutral" />
                <Metric label="Identifier" value={readerSummary?.identifier_hex ?? 'Sin leer'} />
                <Metric label="Potencia" value={readerSummary?.output_power?.length ? readerSummary.output_power.join(' / ') : 'Sin leer'} tone="warning" />
              </div>
              {readerSummary ? <JsonPanel title="ReaderSessionInfo" data={readerSummary} /> : null}
            </SectionCard>

            <SectionCard
              title="Comandos individuales"
              subtitle="Útil para validar respuestas del reader una por una."
            >
              <div className="button-row button-row--wrap">
                <button className="button button--ghost" onClick={() => void fetchFirmware()} type="button" disabled={!session.connected}>Firmware</button>
                <button className="button button--ghost" onClick={() => void fetchTemperature()} type="button" disabled={!session.connected}>Temperatura</button>
                <button className="button button--ghost" onClick={() => void fetchIdentifier()} type="button" disabled={!session.connected}>Identifier</button>
                <button className="button button--ghost" onClick={() => void fetchOutputPower()} type="button" disabled={!session.connected}>Output power</button>
              </div>
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'inventario' ? (
          <div className="panel-grid">
            <SectionCard
              title="Control de inventario"
              subtitle="Inventory simple o continuo con stream por websocket y snapshot acumulado."
              actions={(
                <div className="button-row">
                  <button className="button button--primary" onClick={() => void startInventory(inventoryForm)} type="button" disabled={!session.connected || session.inventory_running}>
                    Iniciar
                  </button>
                  <button className="button button--ghost" onClick={() => void stopInventory()} type="button" disabled={!session.inventory_running}>
                    Detener
                  </button>
                  <button className="button button--ghost" onClick={() => void refreshSnapshot()} type="button">
                    Refrescar snapshot
                  </button>
                </div>
              )}
            >
              <div className="form-grid form-grid--tight">
                <Label title="Rounds">
                  <input type="number" min={1} max={255} value={inventoryForm.rounds} onChange={(event) => setInventoryForm((current) => ({ ...current, rounds: Number(event.target.value) }))} />
                </Label>
                <Label title="Intervalo (ms)">
                  <input type="number" min={0} max={10000} value={inventoryForm.intervalMs} onChange={(event) => setInventoryForm((current) => ({ ...current, intervalMs: Number(event.target.value) }))} />
                </Label>
                <Label title="Continuo">
                  <select value={inventoryForm.continuous ? '1' : '0'} onChange={(event) => setInventoryForm((current) => ({ ...current, continuous: event.target.value === '1' }))}>
                    <option value="1">Sí</option>
                    <option value="0">No</option>
                  </select>
                </Label>
                <Label title="Leer phase">
                  <select value={inventoryForm.readPhase ? '1' : '0'} onChange={(event) => setInventoryForm((current) => ({ ...current, readPhase: event.target.value === '1' }))}>
                    <option value="0">No</option>
                    <option value="1">Sí</option>
                  </select>
                </Label>
              </div>
              <div className="metrics-grid metrics-grid--compact">
                <Metric label="Tags acumulados" value={tags.length} tone="success" />
                <Metric label="Filtro activo" value={epcFilter || 'Ninguno'} />
                <Metric label="Ciclo" value={session.inventory_running ? 'Corriendo' : 'Detenido'} tone={session.inventory_running ? 'success' : 'warning'} />
                <Metric label="Resumen" value={inventorySummary ? 'Disponible' : 'Sin resumen'} />
              </div>
            </SectionCard>

            <SectionCard
              title="Tabla EPC"
              subtitle="Filtra por fragmento de EPC y exporta a JSON o CSV."
              actions={(
                <div className="button-row">
                  <button className="button button--ghost" onClick={handleExportJson} type="button">Exportar JSON</button>
                  <button className="button button--ghost" onClick={handleExportCsv} type="button">Exportar CSV</button>
                </div>
              )}
            >
              <div className="toolbar">
                <Label title="Filtro EPC">
                  <input value={epcFilter} onChange={(event) => setEpcFilter(event.target.value.toUpperCase())} placeholder="3008..." />
                </Label>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>EPC</th>
                      <th>PC</th>
                      <th>RSSI</th>
                      <th>Antena</th>
                      <th>Freq MHz</th>
                      <th>Phase</th>
                      <th>Conteo</th>
                      <th>Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTags.map((tag) => (
                      <tr key={tag.epc}>
                        <td className="mono">{tag.epc}</td>
                        <td className="mono">{tag.pc}</td>
                        <td>{tag.rssi_dbm}</td>
                        <td>{tag.antenna}</td>
                        <td>{tag.frequency_mhz}</td>
                        <td className="mono">{tag.phase ?? '-'}</td>
                        <td>{tag.count}</td>
                        <td>{new Date(tag.updated_at).toLocaleString()}</td>
                      </tr>
                    ))}
                    {filteredTags.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="empty-cell">No hay tags para mostrar.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {inventorySummary ? <JsonPanel title="Último resumen inventory" data={inventorySummary} /> : null}
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'tag' ? (
          <div className="panel-grid panel-grid--two">
            <SectionCard title="ReadTag" subtitle="Lee memoria EPC/TID/User del tag actual.">
              <form className="form-grid" onSubmit={(event) => {
                event.preventDefault()
                try {
                  requireHex('Password', tagReadForm.passwordHex)
                  void readTag({ ...tagReadForm, passwordHex: normalizeHex(tagReadForm.passwordHex) })
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'Entrada inválida')
                }
              }}>
                <Label title="Password (hex)"><input value={tagReadForm.passwordHex} onChange={(event) => setTagReadForm((current) => ({ ...current, passwordHex: event.target.value.toUpperCase() }))} /></Label>
                <Label title="Mem bank"><select value={tagReadForm.memBank} onChange={(event) => setTagReadForm((current) => ({ ...current, memBank: Number(event.target.value) }))}>{memBankLabels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Label>
                <Label title="Word address"><input type="number" value={tagReadForm.wordAddress} onChange={(event) => setTagReadForm((current) => ({ ...current, wordAddress: Number(event.target.value) }))} /></Label>
                <Label title="Word count"><input type="number" value={tagReadForm.wordCount} onChange={(event) => setTagReadForm((current) => ({ ...current, wordCount: Number(event.target.value) }))} /></Label>
                <button className="button button--primary" type="submit" disabled={!session.connected}>Leer memoria</button>
              </form>
            </SectionCard>

            <SectionCard title="WriteTag" subtitle="Escribe datos hex sobre el bank indicado. Requiere confirmación.">
              <form className="form-grid" onSubmit={(event) => {
                event.preventDefault()
                try {
                  requireHex('Password', tagWriteForm.passwordHex)
                  requireHex('Data', tagWriteForm.dataHex)
                  withConfirmation(
                    'Confirmar escritura',
                    'Esta acción modifica el contenido del tag. Verifica mem bank, word address y payload antes de continuar.',
                    'danger',
                    async () => {
                      await writeTag({
                        ...tagWriteForm,
                        passwordHex: normalizeHex(tagWriteForm.passwordHex),
                        dataHex: normalizeHex(tagWriteForm.dataHex),
                      })
                    },
                  )
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'Entrada inválida')
                }
              }}>
                <Label title="Password (hex)"><input value={tagWriteForm.passwordHex} onChange={(event) => setTagWriteForm((current) => ({ ...current, passwordHex: event.target.value.toUpperCase() }))} /></Label>
                <Label title="Mem bank"><select value={tagWriteForm.memBank} onChange={(event) => setTagWriteForm((current) => ({ ...current, memBank: Number(event.target.value) }))}>{memBankLabels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Label>
                <Label title="Word address"><input type="number" value={tagWriteForm.wordAddress} onChange={(event) => setTagWriteForm((current) => ({ ...current, wordAddress: Number(event.target.value) }))} /></Label>
                <Label title="Data hex"><textarea value={tagWriteForm.dataHex} onChange={(event) => setTagWriteForm((current) => ({ ...current, dataHex: event.target.value.toUpperCase() }))} rows={4} /></Label>
                <button className="button button--danger" type="submit" disabled={!session.connected}>Escribir tag</button>
              </form>
            </SectionCard>

            <SectionCard title="LockTag / KillTag" subtitle="Operaciones destructivas con confirmación explícita.">
              <div className="form-grid form-grid--tight">
                <Label title="Lock password"><input value={tagLockForm.passwordHex} onChange={(event) => setTagLockForm((current) => ({ ...current, passwordHex: event.target.value.toUpperCase() }))} /></Label>
                <Label title="Mem bank"><select value={tagLockForm.memBank} onChange={(event) => setTagLockForm((current) => ({ ...current, memBank: Number(event.target.value) }))}>{memBankLabels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Label>
                <Label title="Tipo de lock"><select value={tagLockForm.lockType} onChange={(event) => setTagLockForm((current) => ({ ...current, lockType: Number(event.target.value) }))}>{lockTypeLabels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Label>
              </div>
              <div className="button-row button-row--wrap">
                <button className="button button--danger" type="button" disabled={!session.connected} onClick={() => {
                  try {
                    requireHex('Password lock', tagLockForm.passwordHex)
                    withConfirmation(
                      'Confirmar bloqueo',
                      'LockTag puede dejar una región inaccesible para escritura o lectura según el banco y el tipo de lock.',
                      'danger',
                      async () => {
                        await lockTag({ ...tagLockForm, passwordHex: normalizeHex(tagLockForm.passwordHex) })
                      },
                    )
                  } catch (error) {
                    alert(error instanceof Error ? error.message : 'Entrada inválida')
                  }
                }}>LockTag</button>
                <Label title="Kill password"><input value={tagKillForm.passwordHex} onChange={(event) => setTagKillForm({ passwordHex: event.target.value.toUpperCase() })} /></Label>
                <button className="button button--danger" type="button" disabled={!session.connected} onClick={() => {
                  try {
                    requireHex('Kill password', tagKillForm.passwordHex)
                    withConfirmation(
                      'Confirmar kill',
                      'KillTag inutiliza el tag. Solo continúa si el procedimiento está probado y el tag es descartable.',
                      'danger',
                      async () => {
                        await killTag({ passwordHex: normalizeHex(tagKillForm.passwordHex) })
                      },
                    )
                  } catch (error) {
                    alert(error instanceof Error ? error.message : 'Entrada inválida')
                  }
                }}>KillTag</button>
              </div>
            </SectionCard>

            <SectionCard title="Access EPC Match" subtitle="Configura filtro de acceso por EPC exacto.">
              <form className="form-grid" onSubmit={(event) => {
                event.preventDefault()
                try {
                  requireHex('EPC filtro', accessMatchForm.epcHex)
                  void setAccessMatch({ epcHex: normalizeHex(accessMatchForm.epcHex), mode: accessMatchForm.mode })
                } catch (error) {
                  alert(error instanceof Error ? error.message : 'Entrada inválida')
                }
              }}>
                <Label title="EPC hex"><textarea value={accessMatchForm.epcHex} onChange={(event) => setAccessMatchForm((current) => ({ ...current, epcHex: event.target.value.toUpperCase() }))} rows={4} /></Label>
                <Label title="Mode"><input type="number" min={0} max={255} value={accessMatchForm.mode} onChange={(event) => setAccessMatchForm((current) => ({ ...current, mode: Number(event.target.value) }))} /></Label>
                <div className="button-row button-row--wrap">
                  <button className="button button--primary" type="submit" disabled={!session.connected}>Set filter</button>
                  <button className="button button--ghost" type="button" onClick={() => void getAccessMatch()} disabled={!session.connected}>Get filter</button>
                  <button className="button button--ghost" type="button" onClick={() => void clearAccessMatch()} disabled={!session.connected}>Clear filter</button>
                </div>
              </form>
              {accessMatch ? <JsonPanel title="AccessMatchResult" data={accessMatch} /> : null}
              {tagResult ? <JsonPanel title="Último resultado de tag" data={tagResult} /> : null}
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'netport' ? (
          <div className="panel-grid">
            <SectionCard
              title="Broadcast scan"
              subtitle="Descubre módulos NetPort por broadcast UDP desde la interfaz indicada."
              actions={(
                <button className="button button--primary" onClick={() => void scanNetPort(scanForm)} type="button">
                  Escanear ahora
                </button>
              )}
            >
              <div className="form-grid form-grid--tight">
                <Label title="Bind IP"><input value={scanForm.bindIp} onChange={(event) => setScanForm((current) => ({ ...current, bindIp: event.target.value }))} /></Label>
                <Label title="Segundos"><input type="number" step="0.5" value={scanForm.seconds} onChange={(event) => setScanForm((current) => ({ ...current, seconds: Number(event.target.value) }))} /></Label>
              </div>
              <div className="stack-list">
                {netScanResults.length === 0 ? <p className="muted">Sin dispositivos descubiertos todavía.</p> : null}
                {netScanResults.map((item, index) => (
                  <button
                    key={`${String(item.device_mac ?? index)}-${String(item.source_ip ?? '')}`}
                    type="button"
                    className="list-row list-row--button"
                    onClick={() => setNetGetForm((current) => ({ ...current, deviceMac: String(item.device_mac ?? current.deviceMac) }))}
                  >
                    <strong>{String(item.source_ip ?? 'sin ip')}</strong>
                    <span>{String(item.device_mac ?? 'sin mac')}</span>
                    <small>{String(item.found_device ? JSON.stringify(item.found_device) : 'clic para usar MAC en el formulario')}</small>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Editor visual NetPort"
              subtitle="Lectura, set, reset y restore default de configuración base y puertos 0/1."
              actions={(
                <div className="button-row button-row--wrap">
                  <button className="button button--ghost" onClick={() => void getNetPort(netGetForm).then(applyNetPacket)} type="button">Get</button>
                  <button className="button button--danger" onClick={() => withConfirmation('Guardar NetPort', 'Esta operación reescribe la configuración del módulo usando el formulario actual.', 'danger', async () => { await setNetPort(buildNetPayload()) })} type="button">Set</button>
                  <button className="button button--danger" onClick={() => withConfirmation('Reset NetPort', 'Reinicia el módulo NetPort remoto.', 'danger', async () => { await resetNetPort({ bindIp: netGetForm.bindIp, deviceMac: netGetForm.deviceMac, timeout: netGetForm.timeout }) })} type="button">Reset</button>
                  <button className="button button--danger" onClick={() => withConfirmation('Restaurar defaults', 'Restaura configuración default del módulo NetPort.', 'danger', async () => { await defaultNetPort({ bindIp: netGetForm.bindIp, deviceMac: netGetForm.deviceMac, pcMac: netGetForm.pcMac, timeout: netGetForm.timeout }) })} type="button">Default</button>
                </div>
              )}
            >
              <div className="form-grid">
                <Label title="Bind IP"><input value={netGetForm.bindIp} onChange={(event) => setNetGetForm((current) => ({ ...current, bindIp: event.target.value }))} /></Label>
                <Label title="Device MAC"><input value={netGetForm.deviceMac} onChange={(event) => setNetGetForm((current) => ({ ...current, deviceMac: event.target.value.toUpperCase() }))} /></Label>
                <Label title="PC MAC"><input value={netGetForm.pcMac} onChange={(event) => setNetGetForm((current) => ({ ...current, pcMac: event.target.value.toUpperCase() }))} /></Label>
                <Label title="Timeout"><input type="number" step="0.5" value={netGetForm.timeout} onChange={(event) => setNetGetForm((current) => ({ ...current, timeout: Number(event.target.value) }))} /></Label>
              </div>

              <div className="subsection-grid">
                <div className="subsection">
                  <h3>Hardware config</h3>
                  <div className="form-grid form-grid--tight">
                    <Label title="Module name"><input value={hwConfig.module_name} onChange={(event) => setHwConfig((current) => ({ ...current, module_name: event.target.value }))} /></Label>
                    <Label title="MAC"><input value={hwConfig.mac} onChange={(event) => setHwConfig((current) => ({ ...current, mac: event.target.value.toUpperCase() }))} /></Label>
                    <Label title="IP"><input value={hwConfig.ip} onChange={(event) => setHwConfig((current) => ({ ...current, ip: event.target.value }))} /></Label>
                    <Label title="Gateway"><input value={hwConfig.gateway} onChange={(event) => setHwConfig((current) => ({ ...current, gateway: event.target.value }))} /></Label>
                    <Label title="Subnet mask"><input value={hwConfig.subnet_mask} onChange={(event) => setHwConfig((current) => ({ ...current, subnet_mask: event.target.value }))} /></Label>
                    <Label title="Web port"><input type="number" value={hwConfig.web_port} onChange={(event) => setHwConfig((current) => ({ ...current, web_port: Number(event.target.value) }))} /></Label>
                    <Label title="Username"><input value={hwConfig.username} onChange={(event) => setHwConfig((current) => ({ ...current, username: event.target.value }))} /></Label>
                    <Label title="Password"><input value={hwConfig.password} onChange={(event) => setHwConfig((current) => ({ ...current, password: event.target.value }))} /></Label>
                    <Label title="DHCP"><select value={hwConfig.dhcp_enabled ? '1' : '0'} onChange={(event) => setHwConfig((current) => ({ ...current, dhcp_enabled: event.target.value === '1' }))}><option value="0">Off</option><option value="1">On</option></select></Label>
                    <Label title="Serial cfg"><select value={hwConfig.serial_config_enabled ? '1' : '0'} onChange={(event) => setHwConfig((current) => ({ ...current, serial_config_enabled: event.target.value === '1' }))}><option value="1">On</option><option value="0">Off</option></select></Label>
                  </div>
                </div>

                {[port0, port1].map((port, index) => {
                  const setPort = index === 0 ? setPort0 : setPort1
                  return (
                    <div className="subsection" key={port.index}>
                      <h3>{`Port ${index}`}</h3>
                      <div className="form-grid form-grid--tight">
                        <Label title="Enabled"><select value={port.enabled ? '1' : '0'} onChange={(event) => setPort((current) => ({ ...current, enabled: event.target.value === '1' }))}><option value="1">On</option><option value="0">Off</option></select></Label>
                        <Label title="Net mode"><select value={port.net_mode} onChange={(event) => setPort((current) => ({ ...current, net_mode: Number(event.target.value) }))}>{Object.entries(netModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Label>
                        <Label title="Net port"><input type="number" value={port.net_port} onChange={(event) => setPort((current) => ({ ...current, net_port: Number(event.target.value) }))} /></Label>
                        <Label title="Dest IP"><input value={port.destination_ip} onChange={(event) => setPort((current) => ({ ...current, destination_ip: event.target.value }))} /></Label>
                        <Label title="Dest port"><input type="number" value={port.destination_port} onChange={(event) => setPort((current) => ({ ...current, destination_port: Number(event.target.value) }))} /></Label>
                        <Label title="Baudrate"><input type="number" value={port.baudrate} onChange={(event) => setPort((current) => ({ ...current, baudrate: Number(event.target.value) }))} /></Label>
                        <Label title="Data bits"><input type="number" value={port.data_bits} onChange={(event) => setPort((current) => ({ ...current, data_bits: Number(event.target.value) }))} /></Label>
                        <Label title="Stop bits"><input type="number" value={port.stop_bits} onChange={(event) => setPort((current) => ({ ...current, stop_bits: Number(event.target.value) }))} /></Label>
                        <Label title="Parity"><input type="number" value={port.parity} onChange={(event) => setPort((current) => ({ ...current, parity: Number(event.target.value) }))} /></Label>
                        <Label title="DNS host"><input value={port.dns_host_ip} onChange={(event) => setPort((current) => ({ ...current, dns_host_ip: event.target.value }))} /></Label>
                      </div>
                    </div>
                  )
                })}
              </div>
              {netPacket ? <JsonPanel title="Último paquete NetPort" data={netPacket} /> : null}
            </SectionCard>
          </div>
        ) : null}

        {activeTab === 'cfg' ? (
          <div className="panel-grid panel-grid--two">
            <SectionCard title="Decode CFG" subtitle="Sube un archivo .cfg o pega el hex completo del demo Windows.">
              <div className="form-grid">
                <Label title="Archivo .cfg">
                  <input type="file" accept=".cfg,.txt" onChange={(event) => setCfgFile(event.target.files?.[0] ?? null)} />
                </Label>
                <Label title="Hex manual">
                  <textarea rows={8} value={cfgHexInput} onChange={(event) => setCfgHexInput(event.target.value)} placeholder="FA 00 11 ..." />
                </Label>
              </div>
              <div className="button-row button-row--wrap">
                <button className="button button--primary" type="button" onClick={() => void decodeCfg(cfgHexInput || undefined, cfgFile).then(applyNetPacket)}>
                  Decodificar
                </button>
                <button className="button button--ghost" type="button" onClick={() => { setCfgHexInput(''); setCfgFile(null) }}>
                  Limpiar
                </button>
              </div>
              {cfgResult ? <JsonPanel title="Resultado decode / encode" data={cfgResult} /> : null}
            </SectionCard>

            <SectionCard title="Encode CFG y consola de logs" subtitle="Genera hex para exportar y revisa TX/RX del backend en tiempo real.">
              <div className="button-row button-row--wrap">
                <button className="button button--primary" type="button" onClick={() => void encodeCfg({ pcMac: netGetForm.pcMac, deviceMac: netGetForm.deviceMac, hwConfig, port0, port1 }).then((result) => setEncodedCfgHex(result.hex))}>
                  Generar CFG
                </button>
                <button className="button button--ghost" type="button" onClick={() => void refreshLogs()}>
                  Refrescar logs
                </button>
                <button className="button button--ghost" type="button" onClick={() => encodedCfgHex ? downloadText('netport-export.cfg', encodedCfgHex, 'text/plain;charset=utf-8') : undefined} disabled={!encodedCfgHex}>
                  Exportar .cfg
                </button>
              </div>
              <Label title="CFG codificado">
                <textarea rows={6} value={encodedCfgHex} onChange={(event) => setEncodedCfgHex(event.target.value)} placeholder="Aquí aparece el hex exportable." />
              </Label>
              <div className="log-console">
                <div className="log-console__header">
                  <strong>Logs RFID</strong>
                  <span>{logs.length} eventos</span>
                </div>
                <div className="log-console__body">
                  {logs.map((entry, index) => (
                    <div key={`${entry.timestamp}-${index}`} className="log-row">
                      <span className={`log-badge ${entry.direction.includes('send') ? 'log-badge--send' : 'log-badge--recv'}`}>{entry.direction}</span>
                      <span className="mono">{entry.hex}</span>
                      <small>{new Date(entry.timestamp).toLocaleTimeString()}</small>
                    </div>
                  ))}
                  {logs.length === 0 ? <p className="muted">Sin tráfico todavía.</p> : null}
                </div>
              </div>
            </SectionCard>
          </div>
        ) : null}
      </main>

      {confirm ? (
        <div className="modal-backdrop" role="presentation">
          <div className={`confirm-modal confirm-modal--${confirm.tone}`} role="dialog" aria-modal="true">
            <p className="eyebrow">Confirmación requerida</p>
            <h2>{confirm.title}</h2>
            <p>{confirm.description}</p>
            <div className="button-row">
              <button className="button button--ghost" type="button" onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={`button ${confirm.tone === 'danger' ? 'button--danger' : 'button--primary'}`} type="button" onClick={() => {
                const pending = confirm.action()
                setConfirm(null)
                void pending
              }}>Confirmar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
