from __future__ import annotations

import csv
import json
import queue
import threading
from pathlib import Path
from typing import Any, Callable

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

from rfid_runtime import RfidController

MEM_BANK_OPTIONS = [('0', 'Reserved'), ('1', 'EPC'), ('2', 'TID'), ('3', 'User')]
LOCK_TYPE_OPTIONS = [('0', 'Unlock'), ('1', 'Permanent Unlock'), ('2', 'Lock'), ('3', 'Permanent Lock')]
NET_MODE_OPTIONS = [('0', 'TCP Server'), ('1', 'TCP Client'), ('2', 'UDP'), ('3', 'UDP Multicast')]
REGION_OPTIONS = ['FCC', 'ETSI', 'CHN', 'CUSTOM']
BEEPER_OPTIONS = ['quiet', 'inventory_round', 'tag_detected']
RF_PROFILE_OPTIONS = ['D0', 'D1', 'D2', 'D3']
STATE_PATH = Path.home() / '.config' / 'maquinita' / 'rfid_desktop_state.json'

DEFAULT_CONNECTION = {
    'transport': 'tcp',
    'host': '192.168.1.116',
    'port': '4001',
    'device': '',
    'baud': '115200',
    'readId': 'FF',
    'timeout': '3',
    'connectTimeout': '2',
}

DEFAULT_INVENTORY = {'rounds': '1', 'continuous': True, 'intervalMs': '400', 'readPhase': False}
DEFAULT_TAG_READ = {'passwordHex': '00000000', 'memBank': '1', 'wordAddress': '2', 'wordCount': '6'}
DEFAULT_TAG_WRITE = {'passwordHex': '00000000', 'memBank': '1', 'wordAddress': '2', 'dataHex': '300833B2DDD9014000000000'}
DEFAULT_TAG_LOCK = {'passwordHex': '00000000', 'memBank': '1', 'lockType': '2'}
DEFAULT_TAG_KILL = {'passwordHex': '00000000'}
DEFAULT_ACCESS_MATCH = {'epcHex': '', 'mode': '0'}
DEFAULT_SCAN = {'bindIp': '192.168.1.50', 'seconds': '3'}
DEFAULT_NET_META = {'bindIp': '192.168.1.50', 'deviceMac': '11:22:33:44:55:66', 'pcMac': 'AA:BB:CC:DD:EE:FF', 'timeout': '3'}
DEFAULT_READER = {
    'firmware': '',
    'temperature': '',
    'identifierHex': '',
    'workAntenna': '1',
    'powerAll': '30',
    'powerA1': '30',
    'powerA2': '30',
    'powerA3': '30',
    'powerA4': '30',
    'tempPower': '30',
    'regionName': 'FCC',
    'regionStart': '7',
    'regionEnd': '59',
    'freqSpaceKhz': '50',
    'freqQuantity': '1',
    'startFreqKhz': '915000',
    'baudrateSet': '115200',
    'beeperMode': 'inventory_round',
    'antDetector': '0',
    'rfLinkProfile': 'D1',
    'returnLossFreq': '33',
    'gpio1': False,
    'gpio2': False,
    'gpio3': False,
    'gpio4': False,
}
DEFAULT_HW = {
    'dev_type': '1',
    'aux_dev_type': '0',
    'index': '0',
    'hardware_version': '1',
    'software_version': '1',
    'module_name': 'NETPORT',
    'mac': '11:22:33:44:55:66',
    'ip': '192.168.1.200',
    'gateway': '192.168.1.1',
    'subnet_mask': '255.255.255.0',
    'dhcp_enabled': False,
    'web_port': '80',
    'username': 'admin',
    'password_enabled': False,
    'password': 'admin',
    'update_flag': False,
    'serial_config_enabled': True,
}


def default_port(index: int) -> dict[str, Any]:
    return {
        'index': str(index),
        'enabled': index == 0,
        'net_mode': '0',
        'random_source_port': False,
        'net_port': str(4001 + index),
        'destination_ip': '192.168.1.50',
        'destination_port': str(4001 + index),
        'baudrate': '115200',
        'data_bits': '8',
        'stop_bits': '1',
        'parity': '0',
        'phy_disconnect_handle': False,
        'rx_packet_length': '0',
        'rx_packet_timeout': '0',
        'reconnect_count': '0',
        'reset_ctrl': False,
        'dns_enabled': False,
        'domain_name': '',
        'dns_host_ip': '0.0.0.0',
        'dns_host_port': '0',
    }


DEFAULT_STATE = {
    'connection': DEFAULT_CONNECTION,
    'inventory': DEFAULT_INVENTORY,
    'tag_read': DEFAULT_TAG_READ,
    'tag_write': DEFAULT_TAG_WRITE,
    'tag_lock': DEFAULT_TAG_LOCK,
    'tag_kill': DEFAULT_TAG_KILL,
    'access_match': DEFAULT_ACCESS_MATCH,
    'scan': DEFAULT_SCAN,
    'net_meta': DEFAULT_NET_META,
    'reader': DEFAULT_READER,
    'hw': DEFAULT_HW,
    'port0': default_port(0),
    'port1': default_port(1),
}


def make_var(master: tk.Misc, value: Any) -> tk.Variable:
    if isinstance(value, bool):
        return tk.BooleanVar(master, value=value)
    return tk.StringVar(master, value=str(value))


def make_vars(master: tk.Misc, defaults: dict[str, Any]) -> dict[str, tk.Variable]:
    return {key: make_var(master, value) for key, value in defaults.items()}


def merge_defaults(base: dict[str, Any], loaded: dict[str, Any] | None) -> dict[str, Any]:
    result = dict(base)
    if not loaded:
        return result
    for key, value in loaded.items():
        if isinstance(result.get(key), dict) and isinstance(value, dict):
            result[key] = merge_defaults(result[key], value)
        else:
            result[key] = value
    return result


class DesktopStateStore:
    def __init__(self, path: Path = STATE_PATH) -> None:
        self.path = path

    def load(self) -> dict[str, Any]:
        if not self.path.exists():
            return merge_defaults(DEFAULT_STATE, None)
        try:
            return merge_defaults(DEFAULT_STATE, json.loads(self.path.read_text(encoding='utf-8')))
        except Exception:
            return merge_defaults(DEFAULT_STATE, None)

    def save(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2), encoding='utf-8')


class RfidDesktopApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title('Maquinita RFID Desktop')
        self.geometry('1520x980')
        self.minsize(1180, 760)

        self.store = DesktopStateStore()
        self.saved_state = self.store.load()
        self.controller = RfidController(event_callback=self._on_controller_event)
        self.ui_queue: queue.Queue[tuple[str, Any, Any]] = queue.Queue()
        self.snapshot_rows: dict[str, str] = {}
        self.net_scan_rows: dict[str, str] = {}
        self.last_cfg_hex = ''

        self.status_connection = tk.StringVar(value='Desconectado')
        self.status_transport = tk.StringVar(value=self.saved_state['connection']['transport'])
        self.status_endpoint = tk.StringVar(value='Sin sesión')
        self.status_read_id = tk.StringVar(value=self.saved_state['connection']['readId'])
        self.status_operation = tk.StringVar(value='Idle')
        self.status_error = tk.StringVar(value='')

        self.connection_vars = make_vars(self, self.saved_state['connection'])
        self.inventory_vars = make_vars(self, self.saved_state['inventory'])
        self.tag_read_vars = make_vars(self, self.saved_state['tag_read'])
        self.tag_write_vars = make_vars(self, self.saved_state['tag_write'])
        self.tag_lock_vars = make_vars(self, self.saved_state['tag_lock'])
        self.tag_kill_vars = make_vars(self, self.saved_state['tag_kill'])
        self.access_match_vars = make_vars(self, self.saved_state['access_match'])
        self.scan_vars = make_vars(self, self.saved_state['scan'])
        self.net_meta_vars = make_vars(self, self.saved_state['net_meta'])
        self.reader_vars = make_vars(self, self.saved_state['reader'])
        self.hw_vars = make_vars(self, self.saved_state['hw'])
        self.port0_vars = make_vars(self, self.saved_state['port0'])
        self.port1_vars = make_vars(self, self.saved_state['port1'])
        self.epc_filter_var = tk.StringVar(value='')
        self.cfg_hex_var = tk.StringVar(value='')
        self.serial_port_var = tk.StringVar(value='')

        self._build_ui()
        self._refresh_serial_ports_local()
        self._refresh_header(self.controller.get_state())
        self.protocol('WM_DELETE_WINDOW', self.on_close)
        self.after(120, self._drain_ui_queue)

    def _build_ui(self) -> None:
        container = ttk.Frame(self, padding=12)
        container.pack(fill='both', expand=True)
        self.columnconfigure(0, weight=1)
        self.rowconfigure(0, weight=1)

        self._build_header(container)

        notebook = ttk.Notebook(container)
        notebook.pack(fill='both', expand=True, pady=(12, 0))

        self.connection_tab = ttk.Frame(notebook, padding=12)
        self.reader_tab = ttk.Frame(notebook, padding=12)
        self.inventory_tab = ttk.Frame(notebook, padding=12)
        self.tag_tab = ttk.Frame(notebook, padding=12)
        self.netport_tab = ttk.Frame(notebook, padding=12)
        self.cfg_tab = ttk.Frame(notebook, padding=12)

        notebook.add(self.connection_tab, text='Conexión')
        notebook.add(self.reader_tab, text='Lector')
        notebook.add(self.inventory_tab, text='Inventario')
        notebook.add(self.tag_tab, text='Operaciones Tag')
        notebook.add(self.netport_tab, text='NetPort')
        notebook.add(self.cfg_tab, text='CFG / Logs')

        self._build_connection_tab()
        self._build_reader_tab()
        self._build_inventory_tab()
        self._build_tag_tab()
        self._build_netport_tab()
        self._build_cfg_tab()

    def _build_header(self, parent: ttk.Frame) -> None:
        header = ttk.LabelFrame(parent, text='Estado del lector', padding=10)
        header.pack(fill='x')
        header.columnconfigure((0, 1, 2, 3, 4, 5), weight=1)

        items = [
            ('Sesión', self.status_connection),
            ('Transporte', self.status_transport),
            ('Destino', self.status_endpoint),
            ('Read ID', self.status_read_id),
            ('Operación', self.status_operation),
            ('Último error', self.status_error),
        ]
        for index, (label, variable) in enumerate(items):
            cell = ttk.Frame(header)
            cell.grid(row=0, column=index, sticky='nsew', padx=6)
            ttk.Label(cell, text=label).pack(anchor='w')
            ttk.Label(cell, textvariable=variable).pack(anchor='w', pady=(2, 0))

    def _build_connection_tab(self) -> None:
        main = ttk.Frame(self.connection_tab)
        main.pack(fill='both', expand=True)
        main.columnconfigure(0, weight=3)
        main.columnconfigure(1, weight=2)
        main.rowconfigure(0, weight=1)

        form = ttk.LabelFrame(main, text='Perfil de conexión', padding=10)
        form.grid(row=0, column=0, sticky='nsew', padx=(0, 8), pady=(0, 8))
        for col in range(4):
            form.columnconfigure(col, weight=1)

        self._field(form, 'Transporte', self.connection_vars['transport'], 0, 0, widget='combo', values=['tcp', 'serial'])
        self._field(form, 'Read ID', self.connection_vars['readId'], 0, 1)
        self._field(form, 'Timeout', self.connection_vars['timeout'], 0, 2)
        self._field(form, 'Connect timeout', self.connection_vars['connectTimeout'], 0, 3)
        self._field(form, 'Host/IP', self.connection_vars['host'], 2, 0)
        self._field(form, 'Puerto TCP', self.connection_vars['port'], 2, 1)
        self._field(form, 'Puerto serial', self.connection_vars['device'], 2, 2)
        self._field(form, 'Baud rate', self.connection_vars['baud'], 2, 3)

        buttons = ttk.Frame(form)
        buttons.grid(row=4, column=0, columnspan=4, sticky='w', pady=(10, 0))
        ttk.Button(buttons, text='Conectar', command=self.connect_reader).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Desconectar', command=lambda: self.run_task('Desconectando', self.controller.disconnect, self._handle_state_result)).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Guardar perfil', command=self.save_state).pack(side='left')

        ports = ttk.LabelFrame(main, text='Puertos seriales', padding=10)
        ports.grid(row=0, column=1, sticky='nsew', pady=(0, 8))
        ports.columnconfigure(0, weight=1)
        ports.rowconfigure(0, weight=1)
        serial_table = ttk.Frame(ports)
        serial_table.pack(fill='both', expand=True)
        serial_table.columnconfigure(0, weight=1)
        serial_table.rowconfigure(0, weight=1)
        self.serial_tree = ttk.Treeview(serial_table, columns=('device', 'description'), show='headings', height=10)
        self.serial_tree.heading('device', text='Device')
        self.serial_tree.heading('description', text='Description')
        self.serial_tree.column('device', width=180, stretch=False)
        self.serial_tree.column('description', width=260, stretch=True)
        serial_y = ttk.Scrollbar(serial_table, orient='vertical', command=self.serial_tree.yview)
        self.serial_tree.configure(yscrollcommand=serial_y.set)
        self.serial_tree.grid(row=0, column=0, sticky='nsew')
        serial_y.grid(row=0, column=1, sticky='ns')
        self.serial_tree.bind('<<TreeviewSelect>>', self._select_serial_port)
        ttk.Button(ports, text='Refrescar puertos', command=self._refresh_serial_ports_local).pack(anchor='w', pady=(8, 0))

    def _build_reader_tab(self) -> None:
        frame = ttk.Frame(self.reader_tab)
        frame.pack(fill='both', expand=True)

        summary = ttk.LabelFrame(frame, text='Estado rápido', padding=10)
        summary.pack(fill='x', pady=(0, 8))
        for col in range(4):
            summary.columnconfigure(col, weight=1)
        self._field(summary, 'Firmware', self.reader_vars['firmware'], 0, 0)
        self._field(summary, 'Temperatura C', self.reader_vars['temperature'], 0, 1)
        self._field(summary, 'Identifier', self.reader_vars['identifierHex'], 0, 2, colspan=2)
        self._field(summary, 'Antena activa', self.reader_vars['workAntenna'], 2, 0, widget='combo', values=['1', '2', '3', '4'])
        self._field(summary, 'RF link', self.reader_vars['rfLinkProfile'], 2, 1, widget='combo', values=RF_PROFILE_OPTIONS)
        self._field(summary, 'Detector dB', self.reader_vars['antDetector'], 2, 2)
        self._field(summary, 'Baud actual', self.connection_vars['baud'], 2, 3)
        summary_actions = ttk.Frame(summary)
        summary_actions.grid(row=4, column=0, columnspan=4, sticky='w', pady=(10, 0))
        ttk.Button(summary_actions, text='Leer resumen', command=lambda: self.run_task('Leyendo resumen', self.controller.reader_session_info, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(summary_actions, text='Firmware', command=lambda: self.run_task('Leyendo firmware', self.controller.reader_firmware, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(summary_actions, text='Temperatura', command=lambda: self.run_task('Leyendo temperatura', self.controller.reader_temperature, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(summary_actions, text='Identifier', command=lambda: self.run_task('Leyendo identifier', self.controller.reader_identifier_get, self._show_reader_result)).pack(side='left')

        notebook = ttk.Notebook(frame)
        notebook.pack(fill='both', expand=True)

        rf_tab = ttk.Frame(notebook, padding=8)
        interface_tab = ttk.Frame(notebook, padding=8)
        gpio_tab = ttk.Frame(notebook, padding=8)
        notebook.add(rf_tab, text='RF básica')
        notebook.add(interface_tab, text='Interfaz')
        notebook.add(gpio_tab, text='GPIO / Diagnóstico')

        self._build_reader_rf_tab(rf_tab)
        self._build_reader_interface_tab(interface_tab)
        self._build_reader_gpio_tab(gpio_tab)

        self.reader_output = ScrolledText(frame, height=12)
        self.reader_output.pack(fill='x', pady=(8, 0))

    def _build_reader_rf_tab(self, parent: ttk.Frame) -> None:
        power = ttk.LabelFrame(parent, text='Potencia / Antena', padding=10)
        power.pack(fill='x', pady=(0, 8))
        for col in range(4):
            power.columnconfigure(col, weight=1)
        self._field(power, 'Antena', self.reader_vars['workAntenna'], 0, 0, widget='combo', values=['1', '2', '3', '4'])
        self._field(power, 'Potencia todas', self.reader_vars['powerAll'], 0, 1)
        self._field(power, 'Potencia temp', self.reader_vars['tempPower'], 0, 2)
        self._field(power, 'Return loss freq', self.reader_vars['returnLossFreq'], 0, 3)
        self._field(power, 'Ant1', self.reader_vars['powerA1'], 2, 0)
        self._field(power, 'Ant2', self.reader_vars['powerA2'], 2, 1)
        self._field(power, 'Ant3', self.reader_vars['powerA3'], 2, 2)
        self._field(power, 'Ant4', self.reader_vars['powerA4'], 2, 3)
        actions = ttk.Frame(power)
        actions.grid(row=4, column=0, columnspan=4, sticky='w', pady=(10, 0))
        ttk.Button(actions, text='Leer antena', command=lambda: self.run_task('Leyendo antena', self.controller.reader_get_work_antenna, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar antena', command=self.reader_set_antenna).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Leer potencia', command=lambda: self.run_task('Leyendo potencia', self.controller.reader_get_output_power, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar potencia', command=self.reader_set_power_all).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar potencia por antena', command=self.reader_set_power_per_antenna).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar temporal', command=self.reader_set_temp_power).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Return loss', command=self.reader_get_return_loss).pack(side='left')

        region = ttk.LabelFrame(parent, text='Región / Frecuencia', padding=10)
        region.pack(fill='x')
        for col in range(5):
            region.columnconfigure(col, weight=1)
        self._field(region, 'Región', self.reader_vars['regionName'], 0, 0, widget='combo', values=REGION_OPTIONS)
        self._field(region, 'Start idx', self.reader_vars['regionStart'], 0, 1)
        self._field(region, 'End idx', self.reader_vars['regionEnd'], 0, 2)
        self._field(region, 'Freq space KHz', self.reader_vars['freqSpaceKhz'], 0, 3)
        self._field(region, 'Start KHz', self.reader_vars['startFreqKhz'], 0, 4)
        self._field(region, 'Freq qty', self.reader_vars['freqQuantity'], 2, 0)
        region_actions = ttk.Frame(region)
        region_actions.grid(row=4, column=0, columnspan=5, sticky='w', pady=(10, 0))
        ttk.Button(region_actions, text='Leer región', command=lambda: self.run_task('Leyendo región', self.controller.reader_get_frequency_region, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(region_actions, text='Aplicar región', command=self.reader_set_region).pack(side='left')

    def _build_reader_interface_tab(self, parent: ttk.Frame) -> None:
        interface = ttk.LabelFrame(parent, text='Interfaz / Persistencia', padding=10)
        interface.pack(fill='x', pady=(0, 8))
        for col in range(4):
            interface.columnconfigure(col, weight=1)
        self._field(interface, 'Identifier hex', self.reader_vars['identifierHex'], 0, 0, colspan=2)
        self._field(interface, 'Nuevo baud', self.reader_vars['baudrateSet'], 0, 2, widget='combo', values=['38400', '115200'])
        self._field(interface, 'Beeper', self.reader_vars['beeperMode'], 0, 3, widget='combo', values=BEEPER_OPTIONS)
        self._field(interface, 'RF profile', self.reader_vars['rfLinkProfile'], 2, 0, widget='combo', values=RF_PROFILE_OPTIONS)
        self._field(interface, 'Detector dB', self.reader_vars['antDetector'], 2, 1)
        actions = ttk.Frame(interface)
        actions.grid(row=4, column=0, columnspan=4, sticky='w', pady=(10, 0))
        ttk.Button(actions, text='Leer identifier', command=lambda: self.run_task('Leyendo identifier', self.controller.reader_identifier_get, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar identifier', command=self.reader_set_identifier).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar baud', command=self.reader_set_baudrate).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar beeper', command=self.reader_set_beeper).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Leer detector', command=lambda: self.run_task('Leyendo detector', self.controller.reader_get_ant_connection_detector, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar detector', command=self.reader_set_ant_detector).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Leer RF link', command=lambda: self.run_task('Leyendo RF link', self.controller.reader_get_rf_link_profile, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar RF link', command=self.reader_set_rf_link).pack(side='left')

    def _build_reader_gpio_tab(self, parent: ttk.Frame) -> None:
        gpio = ttk.LabelFrame(parent, text='GPIO', padding=10)
        gpio.pack(fill='x', pady=(0, 8))
        for col in range(4):
            gpio.columnconfigure(col, weight=1)
        self._field(gpio, 'GPIO1', self.reader_vars['gpio1'], 0, 0, widget='check')
        self._field(gpio, 'GPIO2', self.reader_vars['gpio2'], 0, 1, widget='check')
        self._field(gpio, 'GPIO3', self.reader_vars['gpio3'], 0, 2, widget='check')
        self._field(gpio, 'GPIO4', self.reader_vars['gpio4'], 0, 3, widget='check')
        actions = ttk.Frame(gpio)
        actions.grid(row=2, column=0, columnspan=4, sticky='w', pady=(10, 0))
        ttk.Button(actions, text='Leer GPIO', command=lambda: self.run_task('Leyendo GPIO', self.controller.reader_read_gpio, self._show_reader_result)).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar GPIO3', command=lambda: self.reader_write_gpio(3)).pack(side='left', padx=(0, 8))
        ttk.Button(actions, text='Aplicar GPIO4', command=lambda: self.reader_write_gpio(4)).pack(side='left')

    def _build_inventory_tab(self) -> None:
        top = ttk.LabelFrame(self.inventory_tab, text='Control de inventario', padding=10)
        top.pack(fill='x', pady=(0, 8))
        for col in range(4):
            top.columnconfigure(col, weight=1)
        self._field(top, 'Rounds', self.inventory_vars['rounds'], 0, 0)
        self._field(top, 'Intervalo ms', self.inventory_vars['intervalMs'], 0, 1)
        self._field(top, 'Continuo', self.inventory_vars['continuous'], 0, 2, widget='check')
        self._field(top, 'Leer phase', self.inventory_vars['readPhase'], 0, 3, widget='check')

        buttons = ttk.Frame(top)
        buttons.grid(row=2, column=0, columnspan=4, sticky='w', pady=(10, 0))
        ttk.Button(buttons, text='Iniciar inventory', command=self.start_inventory).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Detener inventory', command=lambda: self.run_task('Deteniendo inventory', self.controller.inventory_stop, self._handle_state_result)).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Export JSON', command=self.export_inventory_json).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Export CSV', command=self.export_inventory_csv).pack(side='left')

        filter_row = ttk.Frame(self.inventory_tab)
        filter_row.pack(fill='x', pady=(0, 8))
        ttk.Label(filter_row, text='Filtro EPC').pack(side='left')
        entry = ttk.Entry(filter_row, textvariable=self.epc_filter_var)
        entry.pack(side='left', fill='x', expand=True, padx=(8, 8))
        entry.bind('<KeyRelease>', lambda _event: self.refresh_inventory_table())

        table_frame = ttk.Frame(self.inventory_tab)
        table_frame.pack(fill='both', expand=True)
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)
        columns = ('epc', 'pc', 'rssi', 'antenna', 'freq', 'phase', 'count', 'updated')
        self.inventory_tree = ttk.Treeview(table_frame, columns=columns, show='headings', height=18)
        headings = {
            'epc': 'EPC',
            'pc': 'PC',
            'rssi': 'RSSI',
            'antenna': 'Antena',
            'freq': 'Freq MHz',
            'phase': 'Phase',
            'count': 'Conteo',
            'updated': 'Actualizado',
        }
        for key, title in headings.items():
            self.inventory_tree.heading(key, text=title)
        widths = {'epc': 220, 'pc': 90, 'rssi': 90, 'antenna': 90, 'freq': 110, 'phase': 90, 'count': 90, 'updated': 180}
        for key, width in widths.items():
            self.inventory_tree.column(key, width=width, stretch=key in {'epc', 'updated'})
        inventory_y = ttk.Scrollbar(table_frame, orient='vertical', command=self.inventory_tree.yview)
        inventory_x = ttk.Scrollbar(table_frame, orient='horizontal', command=self.inventory_tree.xview)
        self.inventory_tree.configure(yscrollcommand=inventory_y.set, xscrollcommand=inventory_x.set)
        self.inventory_tree.grid(row=0, column=0, sticky='nsew')
        inventory_y.grid(row=0, column=1, sticky='ns')
        inventory_x.grid(row=1, column=0, sticky='ew')

        self.inventory_summary = ScrolledText(self.inventory_tab, height=8)
        self.inventory_summary.pack(fill='x', pady=(8, 0))

    def _build_tag_tab(self) -> None:
        root = ttk.Frame(self.tag_tab)
        root.pack(fill='both', expand=True)
        root.columnconfigure((0, 1), weight=1)

        read_frame = ttk.LabelFrame(root, text='ReadTag', padding=10)
        read_frame.grid(row=0, column=0, sticky='nsew', padx=(0, 8), pady=(0, 8))
        self._tag_form(read_frame, self.tag_read_vars, include_word_count=True)
        ttk.Button(read_frame, text='Leer memoria', command=self.read_tag).grid(row=2, column=0, columnspan=4, sticky='w', pady=(10, 0))

        write_frame = ttk.LabelFrame(root, text='WriteTag', padding=10)
        write_frame.grid(row=0, column=1, sticky='nsew', pady=(0, 8))
        self._tag_form(write_frame, self.tag_write_vars, include_data=True)
        ttk.Button(write_frame, text='Escribir tag', command=self.write_tag).grid(row=2, column=0, columnspan=4, sticky='w', pady=(10, 0))

        lock_frame = ttk.LabelFrame(root, text='Lock / Kill', padding=10)
        lock_frame.grid(row=1, column=0, sticky='nsew', padx=(0, 8))
        self._field(lock_frame, 'Password lock', self.tag_lock_vars['passwordHex'], 0, 0)
        self._field(lock_frame, 'Mem bank', self.tag_lock_vars['memBank'], 0, 1, widget='combo', values=[item[0] for item in MEM_BANK_OPTIONS])
        self._field(lock_frame, 'Lock type', self.tag_lock_vars['lockType'], 0, 2, widget='combo', values=[item[0] for item in LOCK_TYPE_OPTIONS])
        ttk.Button(lock_frame, text='LockTag', command=self.lock_tag).grid(row=2, column=0, sticky='w', pady=(10, 0), padx=4)
        self._field(lock_frame, 'Kill password', self.tag_kill_vars['passwordHex'], 2, 0)
        ttk.Button(lock_frame, text='KillTag', command=self.kill_tag).grid(row=4, column=0, sticky='w', pady=(10, 0), padx=4)

        access_frame = ttk.LabelFrame(root, text='Access EPC Match', padding=10)
        access_frame.grid(row=1, column=1, sticky='nsew')
        self._field(access_frame, 'EPC hex', self.access_match_vars['epcHex'], 0, 0, colspan=2)
        self._field(access_frame, 'Mode', self.access_match_vars['mode'], 0, 2)
        buttons = ttk.Frame(access_frame)
        buttons.grid(row=2, column=0, columnspan=3, sticky='w', pady=(10, 0))
        ttk.Button(buttons, text='Set', command=self.set_access_match).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Get', command=lambda: self.run_task('Leyendo filtro EPC', self.controller.access_match_get, self._show_tag_result)).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Clear', command=lambda: self.run_task('Limpiando filtro EPC', self.controller.access_match_clear, self._show_tag_result)).pack(side='left')

        self.tag_output = ScrolledText(self.tag_tab, height=14)
        self.tag_output.pack(fill='x', pady=(8, 0))

    def _build_netport_tab(self) -> None:
        top = ttk.Frame(self.netport_tab)
        top.pack(fill='both', expand=True)
        top.columnconfigure(0, weight=2)
        top.columnconfigure(1, weight=3)

        scan_frame = ttk.LabelFrame(top, text='Descubrimiento NetPort', padding=10)
        scan_frame.grid(row=0, column=0, sticky='nsew', padx=(0, 8), pady=(0, 8))
        scan_frame.columnconfigure((0, 1), weight=1)
        scan_frame.rowconfigure(3, weight=1)
        self._field(scan_frame, 'Bind IP', self.scan_vars['bindIp'], 0, 0)
        self._field(scan_frame, 'Segundos', self.scan_vars['seconds'], 0, 1)
        ttk.Button(scan_frame, text='Escanear', command=self.scan_netport).grid(row=2, column=0, sticky='w', pady=(10, 0), padx=4)
        self.net_scan_tree = ttk.Treeview(scan_frame, columns=('source_ip', 'device_mac', 'device'), show='headings', height=10)
        self.net_scan_tree.heading('source_ip', text='IP origen')
        self.net_scan_tree.heading('device_mac', text='MAC')
        self.net_scan_tree.heading('device', text='Dispositivo')
        self.net_scan_tree.column('source_ip', width=150, stretch=False)
        self.net_scan_tree.column('device_mac', width=170, stretch=False)
        self.net_scan_tree.column('device', width=240, stretch=True)
        scan_y = ttk.Scrollbar(scan_frame, orient='vertical', command=self.net_scan_tree.yview)
        scan_x = ttk.Scrollbar(scan_frame, orient='horizontal', command=self.net_scan_tree.xview)
        self.net_scan_tree.configure(yscrollcommand=scan_y.set, xscrollcommand=scan_x.set)
        self.net_scan_tree.grid(row=3, column=0, columnspan=2, sticky='nsew', pady=(8, 0))
        scan_y.grid(row=3, column=2, sticky='ns', pady=(8, 0))
        scan_x.grid(row=4, column=0, columnspan=2, sticky='ew')
        self.net_scan_tree.bind('<<TreeviewSelect>>', self._select_net_device)

        editor = ttk.LabelFrame(top, text='Editor de configuración', padding=10)
        editor.grid(row=0, column=1, sticky='nsew', pady=(0, 8))
        editor.columnconfigure(0, weight=1)
        meta = ttk.Frame(editor)
        meta.pack(fill='x')
        for col in range(4):
            meta.columnconfigure(col, weight=1)
        self._field(meta, 'Bind IP', self.net_meta_vars['bindIp'], 0, 0)
        self._field(meta, 'Device MAC', self.net_meta_vars['deviceMac'], 0, 1)
        self._field(meta, 'PC MAC', self.net_meta_vars['pcMac'], 0, 2)
        self._field(meta, 'Timeout', self.net_meta_vars['timeout'], 0, 3)

        buttons = ttk.Frame(editor)
        buttons.pack(fill='x', pady=(10, 8))
        ttk.Button(buttons, text='Get', command=self.get_netport).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Set', command=self.set_netport).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Reset', command=self.reset_netport).pack(side='left', padx=(0, 8))
        ttk.Button(buttons, text='Default', command=self.default_netport).pack(side='left')

        sub = ttk.Notebook(editor)
        sub.pack(fill='both', expand=True)
        hw_tab = ttk.Frame(sub, padding=8)
        port0_tab = ttk.Frame(sub, padding=8)
        port1_tab = ttk.Frame(sub, padding=8)
        sub.add(hw_tab, text='Hardware')
        sub.add(port0_tab, text='Port0')
        sub.add(port1_tab, text='Port1')
        self._build_hw_form(hw_tab)
        self._build_port_form(port0_tab, self.port0_vars)
        self._build_port_form(port1_tab, self.port1_vars)

        self.net_output = ScrolledText(self.netport_tab, height=12)
        self.net_output.pack(fill='x')

    def _build_cfg_tab(self) -> None:
        top = ttk.Frame(self.cfg_tab)
        top.pack(fill='both', expand=True)
        top.columnconfigure((0, 1), weight=1)

        cfg_frame = ttk.LabelFrame(top, text='CFG', padding=10)
        cfg_frame.grid(row=0, column=0, sticky='nsew', padx=(0, 8))
        ttk.Label(cfg_frame, text='Hex manual').grid(row=0, column=0, sticky='w')
        self.cfg_hex_text = ScrolledText(cfg_frame, height=14)
        self.cfg_hex_text.grid(row=1, column=0, columnspan=4, sticky='nsew', pady=(4, 8))
        btns = ttk.Frame(cfg_frame)
        btns.grid(row=2, column=0, sticky='w')
        ttk.Button(btns, text='Abrir .cfg', command=self.load_cfg_file).pack(side='left', padx=(0, 8))
        ttk.Button(btns, text='Decode', command=self.decode_cfg).pack(side='left', padx=(0, 8))
        ttk.Button(btns, text='Encode', command=self.encode_cfg).pack(side='left', padx=(0, 8))
        ttk.Button(btns, text='Exportar .cfg', command=self.export_cfg).pack(side='left')

        logs_frame = ttk.LabelFrame(top, text='Logs TX/RX', padding=10)
        logs_frame.grid(row=0, column=1, sticky='nsew')
        self.logs_text = ScrolledText(logs_frame, height=22)
        self.logs_text.pack(fill='both', expand=True)
        ttk.Button(logs_frame, text='Refrescar logs', command=lambda: self._write_text(self.logs_text, json.dumps(self.controller.get_logs(), indent=2))).pack(anchor='w', pady=(8, 0))

        self.cfg_output = ScrolledText(self.cfg_tab, height=12)
        self.cfg_output.pack(fill='x', pady=(8, 0))

    def _field(
        self,
        parent: ttk.Widget,
        label: str,
        variable: tk.Variable,
        row: int,
        column: int,
        *,
        widget: str = 'entry',
        values: list[str] | None = None,
        colspan: int = 1,
    ) -> ttk.Widget:
        ttk.Label(parent, text=label).grid(row=row, column=column, sticky='w', padx=4, pady=(4, 0))
        if widget == 'combo':
            control = ttk.Combobox(parent, textvariable=variable, values=values or [], state='readonly')
        elif widget == 'check':
            control = ttk.Checkbutton(parent, variable=variable)
        else:
            control = ttk.Entry(parent, textvariable=variable)
        control.grid(row=row + 1, column=column, columnspan=colspan, sticky='ew', padx=4, pady=(0, 6))
        return control

    def _tag_form(self, parent: ttk.Frame, variables: dict[str, tk.Variable], *, include_word_count: bool = False, include_data: bool = False) -> None:
        for col in range(4):
            parent.columnconfigure(col, weight=1)
        self._field(parent, 'Password', variables['passwordHex'], 0, 0)
        self._field(parent, 'Mem bank', variables['memBank'], 0, 1, widget='combo', values=[item[0] for item in MEM_BANK_OPTIONS])
        self._field(parent, 'Word address', variables['wordAddress'], 0, 2)
        if include_word_count:
            self._field(parent, 'Word count', variables['wordCount'], 0, 3)
        if include_data:
            self._field(parent, 'Data hex', variables['dataHex'], 0, 3)

    def _build_hw_form(self, parent: ttk.Frame) -> None:
        fields = [
            ('dev_type', 'Dev type'), ('aux_dev_type', 'Aux type'), ('index', 'Index'), ('hardware_version', 'HW version'),
            ('software_version', 'SW version'), ('module_name', 'Module name'), ('mac', 'MAC'), ('ip', 'IP'),
            ('gateway', 'Gateway'), ('subnet_mask', 'Mask'), ('dhcp_enabled', 'DHCP', 'check'), ('web_port', 'Web port'),
            ('username', 'Username'), ('password_enabled', 'Password enabled', 'check'), ('password', 'Password'),
            ('update_flag', 'Update flag', 'check'), ('serial_config_enabled', 'Serial cfg', 'check'),
        ]
        for col in range(4):
            parent.columnconfigure(col, weight=1)
        for index, item in enumerate(fields):
            key, label, *extra = item
            self._field(parent, label, self.hw_vars[key], (index // 4) * 2, index % 4, widget=extra[0] if extra else 'entry')

    def _build_port_form(self, parent: ttk.Frame, variables: dict[str, tk.Variable]) -> None:
        fields = [
            ('index', 'Index'), ('enabled', 'Enabled', 'check'), ('net_mode', 'Net mode', 'combo', [item[0] for item in NET_MODE_OPTIONS]), ('random_source_port', 'Random source', 'check'),
            ('net_port', 'Net port'), ('destination_ip', 'Dest IP'), ('destination_port', 'Dest port'), ('baudrate', 'Baudrate'),
            ('data_bits', 'Data bits'), ('stop_bits', 'Stop bits'), ('parity', 'Parity'), ('phy_disconnect_handle', 'Phy disconnect', 'check'),
            ('rx_packet_length', 'RX length'), ('rx_packet_timeout', 'RX timeout'), ('reconnect_count', 'Reconnect count'), ('reset_ctrl', 'Reset ctrl', 'check'),
            ('dns_enabled', 'DNS enabled', 'check'), ('domain_name', 'Domain name'), ('dns_host_ip', 'DNS host IP'), ('dns_host_port', 'DNS host port'),
        ]
        for col in range(4):
            parent.columnconfigure(col, weight=1)
        for index, item in enumerate(fields):
            key, label, *extra = item
            widget = extra[0] if extra else 'entry'
            values = extra[1] if len(extra) > 1 else None
            self._field(parent, label, variables[key], (index // 4) * 2, index % 4, widget=widget, values=values)

    def _on_controller_event(self, message: dict[str, Any]) -> None:
        self.ui_queue.put(('event', message, None))

    def run_task(self, label: str, func: Callable[[], Any], callback: Callable[[Any], None] | None = None) -> None:
        self.status_operation.set(label)

        def target() -> None:
            try:
                result = func()
                self.ui_queue.put(('result', result, callback))
            except Exception as exc:
                self.ui_queue.put(('error', str(exc), None))

        threading.Thread(target=target, daemon=True).start()

    def _drain_ui_queue(self) -> None:
        while True:
            try:
                kind, payload, callback = self.ui_queue.get_nowait()
            except queue.Empty:
                break
            if kind == 'event':
                self._handle_event(payload)
            elif kind == 'result':
                self.status_operation.set('Idle')
                if callback:
                    callback(payload)
            elif kind == 'error':
                self.status_operation.set('Idle')
                self.status_error.set(str(payload))
                messagebox.showerror('RFID', str(payload))
        self.after(120, self._drain_ui_queue)

    def _handle_event(self, message: dict[str, Any]) -> None:
        event_type = message.get('type')
        payload = message.get('payload', {})
        if event_type == 'connection':
            self._refresh_header(self.controller.get_state())
            return
        if event_type == 'inventory_tag':
            self._upsert_inventory_row(payload)
            self._refresh_header(self.controller.get_state())
            return
        if event_type == 'inventory_summary':
            self._write_text(self.inventory_summary, json.dumps(payload, indent=2))
            return
        if event_type == 'log':
            self.logs_text.insert('1.0', f"[{payload.get('timestamp', '')}] {payload.get('direction', '')} {payload.get('hex', '')}\n")
            return
        if event_type == 'netport_scan_result':
            self._upsert_net_scan_row(payload)
            return
        if event_type == 'error':
            self.status_error.set(str(payload.get('message', '')))

    def _refresh_header(self, state: dict[str, Any]) -> None:
        self.status_connection.set('Conectado' if state.get('connected') else 'Desconectado')
        self.status_transport.set(str(state.get('active_transport') or self.connection_vars['transport'].get()))
        connection = state.get('connection') or {}
        if (connection.get('transport') or self.connection_vars['transport'].get()) == 'serial':
            endpoint = f"{connection.get('device') or self.connection_vars['device'].get()} @ {connection.get('baud') or self.connection_vars['baud'].get()}"
        else:
            endpoint = f"{connection.get('host') or self.connection_vars['host'].get()}:{connection.get('port') or self.connection_vars['port'].get()}"
        self.status_endpoint.set(endpoint)
        self.status_read_id.set(str(state.get('read_id') or self.connection_vars['readId'].get()))
        self.status_error.set(str(state.get('last_error') or ''))

    def _refresh_serial_ports_local(self) -> None:
        for item in self.serial_tree.get_children():
            self.serial_tree.delete(item)
        for port in self.controller.serial_ports():
            self.serial_tree.insert('', 'end', iid=port['device'], values=(port['device'], port['description']))

    def _select_serial_port(self, _event: Any) -> None:
        selection = self.serial_tree.selection()
        if not selection:
            return
        self.connection_vars['transport'].set('serial')
        self.connection_vars['device'].set(selection[0])
        self._refresh_header(self.controller.get_state())

    def _select_net_device(self, _event: Any) -> None:
        selection = self.net_scan_tree.selection()
        if not selection:
            return
        values = self.net_scan_tree.item(selection[0], 'values')
        if len(values) >= 2:
            self.net_meta_vars['deviceMac'].set(values[1])

    def _upsert_inventory_row(self, payload: dict[str, Any]) -> None:
        epc = str(payload.get('epc', ''))
        if not epc:
            return
        self.snapshot_rows[epc] = epc
        self.refresh_inventory_table()

    def refresh_inventory_table(self) -> None:
        for item in self.inventory_tree.get_children():
            self.inventory_tree.delete(item)
        needle = self.epc_filter_var.get().strip().upper()
        for item in self.controller.get_snapshot():
            if needle and needle not in str(item['epc']).upper():
                continue
            self.inventory_tree.insert(
                '',
                'end',
                iid=str(item['epc']),
                values=(
                    item['epc'],
                    item['pc'],
                    item['rssi_dbm'],
                    item['antenna'],
                    item['frequency_mhz'],
                    item.get('phase') or '',
                    item['count'],
                    item['updated_at'],
                ),
            )

    def _upsert_net_scan_row(self, payload: dict[str, Any]) -> None:
        key = str(payload.get('device_mac') or payload.get('source_ip'))
        values = (
            payload.get('source_ip', ''),
            payload.get('device_mac', ''),
            json.dumps(payload.get('found_device') or {}, ensure_ascii=False),
        )
        if key in self.net_scan_rows:
            self.net_scan_tree.item(self.net_scan_rows[key], values=values)
        else:
            item_id = self.net_scan_tree.insert('', 'end', values=values)
            self.net_scan_rows[key] = item_id

    def _show_reader_result(self, result: dict[str, Any]) -> None:
        self._apply_reader_packet(result)
        self._write_text(self.reader_output, json.dumps(result, indent=2))
        self._refresh_header(self.controller.get_state())

    def _show_tag_result(self, result: dict[str, Any]) -> None:
        self._write_text(self.tag_output, json.dumps(result, indent=2))
        self._refresh_header(self.controller.get_state())

    def _show_net_result(self, result: dict[str, Any]) -> None:
        self._write_text(self.net_output, json.dumps(result, indent=2))
        self._apply_net_packet(result)

    def _show_cfg_result(self, result: dict[str, Any]) -> None:
        self._write_text(self.cfg_output, json.dumps(result, indent=2))
        if 'hex' in result:
            self.last_cfg_hex = str(result['hex'])
            self.cfg_hex_text.delete('1.0', 'end')
            self.cfg_hex_text.insert('1.0', self.last_cfg_hex)
        else:
            self._apply_net_packet(result)

    def _handle_state_result(self, result: dict[str, Any]) -> None:
        self._refresh_header(result)
        self.refresh_inventory_table()
        self.save_state()

    def _apply_net_packet(self, packet: dict[str, Any]) -> None:
        if packet.get('device_mac'):
            self.net_meta_vars['deviceMac'].set(str(packet['device_mac']).upper())
        if packet.get('pc_mac'):
            self.net_meta_vars['pcMac'].set(str(packet['pc_mac']).upper())
        for key, target in [('hw_config', self.hw_vars), ('port0', self.port0_vars), ('port1', self.port1_vars)]:
            payload = packet.get(key)
            if not isinstance(payload, dict):
                continue
            for field, variable in target.items():
                if field in payload:
                    if isinstance(variable, tk.BooleanVar):
                        variable.set(bool(payload[field]))
                    else:
                        variable.set(str(payload[field]))

    def _write_text(self, widget: ScrolledText, value: str) -> None:
        widget.delete('1.0', 'end')
        widget.insert('1.0', value)

    def _apply_reader_packet(self, packet: dict[str, Any]) -> None:
        if 'firmware' in packet:
            self.reader_vars['firmware'].set(str(packet['firmware']))
        if 'temperature_c' in packet:
            self.reader_vars['temperature'].set(str(packet['temperature_c']))
        if 'identifier_hex' in packet:
            self.reader_vars['identifierHex'].set(str(packet['identifier_hex']).replace(' ', ''))
        if 'antenna_id' in packet:
            self.reader_vars['workAntenna'].set(str(packet['antenna_id']))
        if 'power_dbm' in packet and packet.get('power_dbm') is not None:
            self.reader_vars['powerAll'].set(str(packet['power_dbm']))
        if 'per_antenna' in packet:
            per_antenna = list(packet['per_antenna'])
            for index, value in enumerate(per_antenna[:4], start=1):
                self.reader_vars[f'powerA{index}'].set(str(value))
            if len(set(per_antenna[:4])) == 1:
                self.reader_vars['powerAll'].set(str(per_antenna[0]))
        if packet.get('region_name'):
            self.reader_vars['regionName'].set(str(packet['region_name']))
        if packet.get('start_freq') is not None:
            self.reader_vars['regionStart'].set(str(packet['start_freq']))
        if packet.get('end_freq') is not None:
            self.reader_vars['regionEnd'].set(str(packet['end_freq']))
        if packet.get('freq_space_khz') is not None:
            self.reader_vars['freqSpaceKhz'].set(str(packet['freq_space_khz']))
        if packet.get('freq_quantity') is not None:
            self.reader_vars['freqQuantity'].set(str(packet['freq_quantity']))
        if packet.get('start_freq_khz') is not None:
            self.reader_vars['startFreqKhz'].set(str(packet['start_freq_khz']))
        if packet.get('mode_name'):
            self.reader_vars['beeperMode'].set(str(packet['mode_name']))
        if packet.get('sensitivity_db') is not None:
            self.reader_vars['antDetector'].set(str(packet['sensitivity_db']))
        if packet.get('profile_hex'):
            self.reader_vars['rfLinkProfile'].set(str(packet['profile_hex']))
        if packet.get('return_loss_db') is not None:
            self.reader_vars['returnLossFreq'].set(str(packet.get('frequency_index', self.reader_vars['returnLossFreq'].get())))
        if packet.get('gpio1') is not None:
            self.reader_vars['gpio1'].set(bool(packet['gpio1']))
        if packet.get('gpio2') is not None:
            self.reader_vars['gpio2'].set(bool(packet['gpio2']))
        if packet.get('gpio') == 3 and packet.get('value') is not None:
            self.reader_vars['gpio3'].set(bool(packet['value']))
        if packet.get('gpio') == 4 and packet.get('value') is not None:
            self.reader_vars['gpio4'].set(bool(packet['value']))
        if packet.get('baudrate') is not None:
            self.connection_vars['baud'].set(str(packet['baudrate']))
            self.reader_vars['baudrateSet'].set(str(packet['baudrate']))
        if 'frequency_region' in packet and isinstance(packet['frequency_region'], dict):
            self._apply_reader_packet(packet['frequency_region'])
        if packet.get('rf_link_profile'):
            self.reader_vars['rfLinkProfile'].set(str(packet['rf_link_profile']))
        if packet.get('work_antenna') is not None:
            self.reader_vars['workAntenna'].set(str(packet['work_antenna']))
        if packet.get('ant_connection_detector') is not None:
            self.reader_vars['antDetector'].set(str(packet['ant_connection_detector']))

    def _hex_value(self, variables: dict[str, tk.Variable], key: str, *, allow_blank: bool = False) -> str:
        raw = str(variables[key].get()).replace(' ', '').replace(':', '').replace('0x', '').replace('0X', '').upper()
        if not raw and allow_blank:
            return ''
        if not raw or len(raw) % 2 != 0:
            raise ValueError(f'{key} debe estar en hex y con longitud par')
        int(raw, 16)
        return raw

    def _collect(self, variables: dict[str, tk.Variable], int_keys: set[str], bool_keys: set[str]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, variable in variables.items():
            value = variable.get()
            if key in bool_keys:
                result[key] = bool(value)
            elif key in int_keys:
                result[key] = int(value)
            else:
                result[key] = value
        return result

    def connect_reader(self) -> None:
        payload = self._collect(self.connection_vars, {'port', 'baud'}, set())
        payload['timeout'] = float(self.connection_vars['timeout'].get())
        payload['connectTimeout'] = float(self.connection_vars['connectTimeout'].get())
        self.run_task('Conectando lector', lambda: self.controller.connect(payload), self._handle_state_result)

    def _confirm_reader_change(self, message: str) -> bool:
        return messagebox.askyesno('Confirmar', message)

    def reader_set_antenna(self) -> None:
        antenna_id = int(self.reader_vars['workAntenna'].get())
        self.run_task('Aplicando antena', lambda: self.controller.reader_set_work_antenna(antenna_id), self._show_reader_result)

    def reader_set_power_all(self) -> None:
        if not self._confirm_reader_change('Esto guarda la potencia RF en flash. ¿Continuar?'):
            return
        power_dbm = int(self.reader_vars['powerAll'].get())
        self.run_task('Aplicando potencia', lambda: self.controller.reader_set_output_power(power_dbm), self._show_reader_result)

    def reader_set_power_per_antenna(self) -> None:
        if not self._confirm_reader_change('Esto guarda la potencia RF por antena en flash. ¿Continuar?'):
            return
        values = [int(self.reader_vars[f'powerA{index}'].get()) for index in range(1, 5)]
        self.run_task('Aplicando potencia por antena', lambda: self.controller.reader_set_output_power(values), self._show_reader_result)

    def reader_set_temp_power(self) -> None:
        power_dbm = int(self.reader_vars['tempPower'].get())
        self.run_task('Aplicando potencia temporal', lambda: self.controller.reader_set_temporary_output_power(power_dbm), self._show_reader_result)

    def reader_set_region(self) -> None:
        if not self._confirm_reader_change('Esto guarda la región/frecuencia en flash. ¿Continuar?'):
            return
        region_name = self.reader_vars['regionName'].get().strip().upper()
        payload: dict[str, Any]
        if region_name == 'CUSTOM':
            payload = {
                'region_code': 0x04,
                'freq_space_khz': int(self.reader_vars['freqSpaceKhz'].get()),
                'freq_quantity': int(self.reader_vars['freqQuantity'].get()),
                'start_freq_khz': int(self.reader_vars['startFreqKhz'].get()),
            }
        else:
            region_map = {'FCC': 0x01, 'ETSI': 0x02, 'CHN': 0x03}
            payload = {
                'region_code': region_map[region_name],
                'start_freq': int(self.reader_vars['regionStart'].get()),
                'end_freq': int(self.reader_vars['regionEnd'].get()),
            }
        self.run_task('Aplicando región', lambda: self.controller.reader_set_frequency_region(payload), self._show_reader_result)

    def reader_set_identifier(self) -> None:
        if not self._confirm_reader_change('Esto guarda el identifier del lector en flash. ¿Continuar?'):
            return
        identifier_hex = self._hex_value(self.reader_vars, 'identifierHex')
        self.run_task('Aplicando identifier', lambda: self.controller.reader_identifier_set(identifier_hex), self._show_reader_result)

    def reader_set_baudrate(self) -> None:
        if not self._confirm_reader_change('Esto cambia el baudrate y reinicia el lector. La app intentará reconectar automáticamente. ¿Continuar?'):
            return
        baudrate = int(self.reader_vars['baudrateSet'].get())
        self.run_task('Aplicando baudrate', lambda: self.controller.reader_set_uart_baudrate(baudrate), self._show_reader_result)

    def reader_set_beeper(self) -> None:
        mode_map = {'quiet': 0, 'inventory_round': 1, 'tag_detected': 2}
        mode = mode_map[self.reader_vars['beeperMode'].get()]
        self.run_task('Aplicando beeper', lambda: self.controller.reader_set_beeper_mode(mode), self._show_reader_result)

    def reader_set_ant_detector(self) -> None:
        sensitivity = int(self.reader_vars['antDetector'].get())
        self.run_task('Aplicando detector', lambda: self.controller.reader_set_ant_connection_detector(sensitivity), self._show_reader_result)

    def reader_set_rf_link(self) -> None:
        if not self._confirm_reader_change('Esto cambia el RF link profile y puede reiniciar el lector. ¿Continuar?'):
            return
        profile_map = {'D0': 0xD0, 'D1': 0xD1, 'D2': 0xD2, 'D3': 0xD3}
        profile_id = profile_map[self.reader_vars['rfLinkProfile'].get().strip().upper()]
        self.run_task('Aplicando RF link', lambda: self.controller.reader_set_rf_link_profile(profile_id), self._show_reader_result)

    def reader_get_return_loss(self) -> None:
        freq_parameter = int(self.reader_vars['returnLossFreq'].get())
        self.run_task('Leyendo return loss', lambda: self.controller.reader_get_rf_port_return_loss(freq_parameter), self._show_reader_result)

    def reader_write_gpio(self, gpio: int) -> None:
        value = bool(self.reader_vars[f'gpio{gpio}'].get())
        self.run_task(f'Aplicando GPIO{gpio}', lambda: self.controller.reader_write_gpio(gpio, value), self._show_reader_result)

    def start_inventory(self) -> None:
        payload = self._collect(self.inventory_vars, {'rounds', 'intervalMs'}, {'continuous', 'readPhase'})
        self.run_task('Iniciando inventory', lambda: self.controller.start_inventory(payload), self._handle_state_result)

    def read_tag(self) -> None:
        payload = self._collect(self.tag_read_vars, {'memBank', 'wordAddress', 'wordCount'}, set())
        payload['passwordHex'] = self._hex_value(self.tag_read_vars, 'passwordHex')
        self.run_task('Leyendo tag', lambda: self.controller.tag_read(payload['passwordHex'], payload['memBank'], payload['wordAddress'], payload['wordCount']), self._show_tag_result)

    def write_tag(self) -> None:
        if not messagebox.askyesno('Confirmar', 'Esta acción escribe datos en el tag. ¿Continuar?'):
            return
        payload = self._collect(self.tag_write_vars, {'memBank', 'wordAddress'}, set())
        payload['passwordHex'] = self._hex_value(self.tag_write_vars, 'passwordHex')
        payload['dataHex'] = self._hex_value(self.tag_write_vars, 'dataHex')
        self.run_task('Escribiendo tag', lambda: self.controller.tag_write(payload['passwordHex'], payload['memBank'], payload['wordAddress'], payload['dataHex']), self._show_tag_result)

    def lock_tag(self) -> None:
        if not messagebox.askyesno('Confirmar', 'LockTag puede dejar el tag inaccesible. ¿Continuar?'):
            return
        payload = self._collect(self.tag_lock_vars, {'memBank', 'lockType'}, set())
        payload['passwordHex'] = self._hex_value(self.tag_lock_vars, 'passwordHex')
        self.run_task('Bloqueando tag', lambda: self.controller.tag_lock(payload['passwordHex'], payload['memBank'], payload['lockType']), self._show_tag_result)

    def kill_tag(self) -> None:
        if not messagebox.askyesno('Confirmar', 'KillTag inutiliza el tag. ¿Continuar?'):
            return
        password = self._hex_value(self.tag_kill_vars, 'passwordHex')
        self.run_task('Matando tag', lambda: self.controller.tag_kill(password), self._show_tag_result)

    def set_access_match(self) -> None:
        payload = self._collect(self.access_match_vars, {'mode'}, set())
        payload['epcHex'] = self._hex_value(self.access_match_vars, 'epcHex')
        self.run_task('Guardando filtro EPC', lambda: self.controller.access_match_set(payload['epcHex'], payload['mode']), self._show_tag_result)

    def scan_netport(self) -> None:
        bind_ip = str(self.scan_vars['bindIp'].get())
        seconds = float(self.scan_vars['seconds'].get())
        self.run_task('Escaneando NetPort', lambda: self.controller.net_scan(bind_ip, seconds), lambda result: self._write_text(self.net_output, json.dumps(result, indent=2)))

    def _collect_hw(self) -> dict[str, Any]:
        return self._collect(
            self.hw_vars,
            {'dev_type', 'aux_dev_type', 'index', 'hardware_version', 'software_version', 'web_port'},
            {'dhcp_enabled', 'password_enabled', 'update_flag', 'serial_config_enabled'},
        )

    def _collect_port(self, variables: dict[str, tk.Variable]) -> dict[str, Any]:
        return self._collect(
            variables,
            {'index', 'net_mode', 'net_port', 'destination_port', 'baudrate', 'data_bits', 'stop_bits', 'parity', 'rx_packet_length', 'rx_packet_timeout', 'reconnect_count', 'dns_host_port'},
            {'enabled', 'random_source_port', 'phy_disconnect_handle', 'reset_ctrl', 'dns_enabled'},
        )

    def _collect_net_meta(self) -> dict[str, Any]:
        payload = self._collect(self.net_meta_vars, set(), set())
        payload['timeout'] = float(self.net_meta_vars['timeout'].get())
        return payload

    def get_netport(self) -> None:
        payload = self._collect_net_meta()
        self.run_task('Leyendo NetPort', lambda: self.controller.net_get(payload['bindIp'], payload['deviceMac'], payload['timeout']), self._show_net_result)

    def set_netport(self) -> None:
        if not messagebox.askyesno('Confirmar', 'Esta acción sobrescribe la configuración NetPort. ¿Continuar?'):
            return
        payload = self._collect_net_meta()
        hw = self._collect_hw()
        port0 = self._collect_port(self.port0_vars)
        port1 = self._collect_port(self.port1_vars)
        self.run_task('Guardando NetPort', lambda: self.controller.net_set(payload['bindIp'], payload['deviceMac'], payload['pcMac'], hw, port0, port1, payload['timeout']), self._show_net_result)

    def reset_netport(self) -> None:
        if not messagebox.askyesno('Confirmar', 'Reset NetPort reinicia el módulo. ¿Continuar?'):
            return
        payload = self._collect_net_meta()
        self.run_task('Reseteando NetPort', lambda: self.controller.net_reset(payload['bindIp'], payload['deviceMac'], payload['timeout']), self._show_net_result)

    def default_netport(self) -> None:
        if not messagebox.askyesno('Confirmar', 'Esto restaura la configuración default de NetPort. ¿Continuar?'):
            return
        payload = self._collect_net_meta()
        self.run_task('Restaurando defaults', lambda: self.controller.net_default(payload['bindIp'], payload['deviceMac'], payload['pcMac'], payload['timeout']), self._show_net_result)

    def load_cfg_file(self) -> None:
        file_path = filedialog.askopenfilename(filetypes=[('CFG', '*.cfg'), ('Text', '*.txt'), ('All', '*.*')])
        if not file_path:
            return
        self.cfg_hex_text.delete('1.0', 'end')
        self.cfg_hex_text.insert('1.0', Path(file_path).read_text(encoding='utf-8', errors='ignore'))

    def decode_cfg(self) -> None:
        raw = self.cfg_hex_text.get('1.0', 'end').strip()
        self.run_task('Decodificando CFG', lambda: self.controller.cfg_decode(raw), self._show_cfg_result)

    def encode_cfg(self) -> None:
        payload = self._collect_net_meta()
        hw = self._collect_hw()
        port0 = self._collect_port(self.port0_vars)
        port1 = self._collect_port(self.port1_vars)
        self.run_task('Codificando CFG', lambda: self.controller.cfg_encode(payload['pcMac'], hw, port0, port1, payload['deviceMac']), self._show_cfg_result)

    def export_cfg(self) -> None:
        if not self.last_cfg_hex:
            messagebox.showinfo('CFG', 'Todavía no hay un CFG codificado para exportar.')
            return
        target = filedialog.asksaveasfilename(defaultextension='.cfg', filetypes=[('CFG', '*.cfg'), ('Text', '*.txt')])
        if not target:
            return
        Path(target).write_text(self.last_cfg_hex, encoding='utf-8')

    def export_inventory_json(self) -> None:
        target = filedialog.asksaveasfilename(defaultextension='.json', filetypes=[('JSON', '*.json')])
        if not target:
            return
        Path(target).write_text(json.dumps(self.controller.get_snapshot(), indent=2), encoding='utf-8')

    def export_inventory_csv(self) -> None:
        target = filedialog.asksaveasfilename(defaultextension='.csv', filetypes=[('CSV', '*.csv')])
        if not target:
            return
        rows = self.controller.get_snapshot()
        with Path(target).open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=['epc', 'pc', 'rssi_dbm', 'antenna', 'frequency_mhz', 'phase', 'count', 'updated_at'])
            writer.writeheader()
            writer.writerows(rows)

    def save_state(self) -> None:
        state = {
            'connection': self._collect(self.connection_vars, {'port', 'baud'}, set()) | {
                'timeout': self.connection_vars['timeout'].get(),
                'connectTimeout': self.connection_vars['connectTimeout'].get(),
            },
            'inventory': self._collect(self.inventory_vars, {'rounds', 'intervalMs'}, {'continuous', 'readPhase'}),
            'tag_read': self._collect(self.tag_read_vars, {'memBank', 'wordAddress', 'wordCount'}, set()),
            'tag_write': self._collect(self.tag_write_vars, {'memBank', 'wordAddress'}, set()),
            'tag_lock': self._collect(self.tag_lock_vars, {'memBank', 'lockType'}, set()),
            'tag_kill': self._collect(self.tag_kill_vars, set(), set()),
            'access_match': self._collect(self.access_match_vars, {'mode'}, set()),
            'scan': self._collect(self.scan_vars, set(), set()),
            'net_meta': self._collect(self.net_meta_vars, set(), set()),
            'reader': self._collect(self.reader_vars, {'workAntenna', 'powerAll', 'powerA1', 'powerA2', 'powerA3', 'powerA4', 'tempPower', 'regionStart', 'regionEnd', 'freqSpaceKhz', 'freqQuantity', 'startFreqKhz', 'baudrateSet', 'antDetector', 'returnLossFreq'}, {'gpio1', 'gpio2', 'gpio3', 'gpio4'}),
            'hw': self._collect_hw(),
            'port0': self._collect_port(self.port0_vars),
            'port1': self._collect_port(self.port1_vars),
        }
        self.store.save(state)

    def on_close(self) -> None:
        try:
            self.save_state()
            self.controller.disconnect()
        except Exception:
            pass
        self.destroy()


def main() -> None:
    app = RfidDesktopApp()
    app.mainloop()


if __name__ == '__main__':
    main()
