import { create } from 'zustand';

// --- Types ---
export interface Product {
    id: number;
    name: string;
    price: number;
    image_url: string | null;
    description?: string;
    heating_instructions?: string;
    nutritional_info?: {
        calories: number;
        protein: string;
        carbs: string;
        fat: string;
    };
    stock?: number;
}

export type MachineState = 'idle' | 'menu' | 'authorizing' | 'shopping' | 'checkout' | 'processing_payment';

interface KioskStore {
    // Estado general de la nevera
    machineState: MachineState;
    setMachineState: (state: MachineState) => void;

    // Productos detectados adentro de la máquina vs comprados
    inventory: Product[];
    setInventory: (items: Product[]) => void;

    cart: Product[];
    addToCart: (item: Product) => void;
    removeFromCart: (itemId: number) => void;
    clearCart: () => void;

    // Calculados
    cartTotal: () => number;

    // Conexión en tiempo real
    connectWebSocket: (machineId: number) => void;
}

export const useKioskStore = create<KioskStore>((set, get) => ({
    machineState: 'idle',
    setMachineState: (state) => set({ machineState: state }),

    inventory: [],
    setInventory: (items) => set({ inventory: items }),

    cart: [],
    addToCart: (item) => set((state) => ({ cart: [...state.cart, item] })),
    removeFromCart: (itemId) => set((state) => {
        // Find index of first match to only remove one item (if there are duplicates)
        const index = state.cart.findIndex(i => i.id === itemId);
        if (index > -1) {
            const newCart = [...state.cart];
            newCart.splice(index, 1);
            return { cart: newCart };
        }
        return state;
    }),
    clearCart: () => set({ cart: [] }),

    cartTotal: () => {
        const items = get().cart;
        return items.reduce((sum, item) => sum + item.price, 0);
    },

    connectWebSocket: (machineId) => {
        // En producción cambiar a WSS y ruta ambiental.
        const ws = new WebSocket(`ws://localhost:8000/api/v1/websockets/kiosk/${machineId}`);

        ws.onopen = () => {
            console.log(`[WebSocket] Kiosco conectado a máquina ${machineId}`);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log("[WebSocket] Mensaje recibido:", data);

                if (data.event === 'door_status' && data.status === 'unlocked') {
                    // Cuando el servidor confirma pre-auth vía app móvil o dashboard, o tarjeta física.
                    set({ machineState: 'shopping' });
                }
            } catch (err) {
                console.error("Error parseando mensaje WS", err);
            }
        };

        ws.onclose = () => {
            console.log("[WebSocket] Desconectado, reintentando...");
            setTimeout(() => get().connectWebSocket(machineId), 5000);
        };
    }
}));
