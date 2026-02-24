import { useEffect } from 'react';
import { useKioskStore, type Product } from '../store/kioskStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

// MOCK data para desarrollo del Kiosk sin el Backend real conectado aun
const MOCK_INVENTORY: Product[] = [
    { id: 101, name: "Ensalada César con Pollo", price: 8.50, image_url: null },
    { id: 102, name: "Wrap de Atún Picante", price: 7.00, image_url: null },
    { id: 103, name: "Jugo Prensado en Frío (Verde)", price: 4.50, image_url: null },
    { id: 104, name: "Bowl de Frutas Frescas", price: 5.00, image_url: null },
];

export default function ShoppingScreen() {
    const { cart, addToCart, removeFromCart, setMachineState, cartTotal } = useKioskStore();

    // Simular que el usuario agarra productos aleatoriamente (como si el RFID o la Cámara los detectara faltantes)
    useEffect(() => {
        let itemsAdded = 0;
        const interval = setInterval(() => {
            if (itemsAdded < 3) {
                // Agregar un item aleatorio al carrito
                const randomItem = MOCK_INVENTORY[Math.floor(Math.random() * MOCK_INVENTORY.length)];
                addToCart(randomItem);
                itemsAdded++;
            }
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    // Simular el cierre de puerta
    const handleCloseDoor = () => {
        setMachineState('checkout');
    };

    return (
        <div className="flex h-full w-full bg-slate-50 text-slate-800">
            {/* Panel Principal Izquierdo: Estado de Puerta y Animaciones */}
            <div className="flex-1 flex flex-col justify-center items-center p-12 bg-white relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-white z-0" />

                <div className="z-10 text-center flex flex-col items-center">
                    <motion.div
                        animate={{
                            scale: [1, 1.05, 1],
                            opacity: [1, 0.8, 1]
                        }}
                        transition={{ repeat: Infinity, duration: 3 }}
                        className="w-32 h-32 rounded-full bg-emerald-100 flex items-center justify-center mb-8 border-4 border-emerald-200"
                    >
                        <Lock className="w-12 h-12 text-emerald-600 mb-1" />
                        <span className="absolute mt-14 text-emerald-700 font-bold text-sm">ABIERTA</span>
                    </motion.div>

                    <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight text-center max-w-md">
                        ¡Hola! Toma los productos que desees.
                    </h2>
                    <p className="mt-4 text-xl text-slate-500 font-medium">
                        Cierra la puerta correctamente cuando termines.
                    </p>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        whileHover={{ scale: 1.05 }}
                        className="mt-16 bg-slate-900 text-white px-8 py-4 rounded-full font-bold shadow-xl shadow-slate-900/20 flex items-center gap-3"
                        onClick={handleCloseDoor}
                    >
                        Simular Cierre de Puerta
                        <CheckCircle2 className="w-5 h-5" />
                    </motion.button>
                </div>
            </div>

            {/* Panel Derecho: Carrito en tiempo real (Virtual Cart) */}
            <div className="w-[450px] bg-slate-100 border-l border-slate-200 flex flex-col shadow-2xl z-20">
                <div className="p-8 pb-4 border-b border-slate-200 bg-white shadow-sm z-10">
                    <div className="flex items-center gap-3 mb-2">
                        <ShoppingBag className="w-6 h-6 text-slate-800" />
                        <h3 className="text-2xl font-bold text-slate-900">Tu Cesta</h3>
                    </div>
                    <p className="text-sm font-medium text-slate-500 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4 text-primary-500" />
                        Se actualiza automáticamente
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    <AnimatePresence>
                        {cart.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="h-full flex flex-col items-center justify-center text-slate-400"
                            >
                                <ShoppingBag className="w-16 h-16 opacity-20 mb-4" />
                                <p className="text-lg font-medium text-center">La cesta está vacía.<br />Saca un producto de la nevera.</p>
                            </motion.div>
                        ) : (
                            <div className="space-y-3">
                                {cart.map((item, index) => (
                                    <motion.div
                                        key={`${item.id}-${index}`}
                                        initial={{ opacity: 0, x: 20, scale: 0.9 }}
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        exit={{ opacity: 0, x: -20, scale: 0.9 }}
                                        layout
                                        className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-red-200"
                                        onClick={() => removeFromCart(item.id)} // Simula devolverlo
                                        title="Click para simular DEVOLVER a la nevera"
                                    >
                                        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                            {item.image_url ? (
                                                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-6 h-6 bg-slate-200 rounded-sm" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="font-bold text-slate-800 leading-tight">{item.name}</h4>
                                            <p className="text-primary-600 font-semibold mt-1">${item.price.toFixed(2)}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="bg-white p-8 border-t border-slate-200 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
                    <div className="flex justify-between items-end">
                        <span className="text-slate-500 font-semibold text-lg">Subtotal</span>
                        <motion.span
                            key={cartTotal()}
                            initial={{ scale: 1.2, color: '#0ea5e9' }}
                            animate={{ scale: 1, color: '#0f172a' }}
                            className="text-4xl font-extrabold tracking-tight"
                        >
                            ${cartTotal().toFixed(2)}
                        </motion.span>
                    </div>
                </div>
            </div>
        </div>
    );
}
