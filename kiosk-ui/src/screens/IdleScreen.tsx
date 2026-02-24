import { useState, useEffect } from 'react';
import { CreditCard, Smartphone, ShieldCheck, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskStore } from '../store/kioskStore';

export default function IdleScreen() {
    const { setMachineState } = useKioskStore();
    const [tapActive, setTapActive] = useState(false);

    // Animación de pulso para el área de escaneo
    useEffect(() => {
        const interval = setInterval(() => {
            setTapActive(prev => !prev);
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    // Función falsa para simular un Tap de tarjeta. En la vida real, el lector (Stripe/Nayax) manda el evento al Backend,
    // y el Backend nos avisa por WebSocket que la máquina cambiará a "authorizing". Aquí simulamos el flujo en UI.
    const handleSimulatedTap = () => {
        setMachineState('authorizing');
        // Simular respuesta rápida tras autorizar tarjeta
        setTimeout(() => setMachineState('shopping'), 1500);
    };

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-between bg-dark-surface p-10 overflow-hidden" onClick={handleSimulatedTap}>
            {/* Background Decorativo Abstracto */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-primary-600/10 blur-[120px] mix-blend-screen" />
                <div className="absolute bottom-[-10%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-indigo-500/10 blur-[100px] mix-blend-screen" />
            </div>

            {/* Header - Brand */}
            <header className="w-full flex justify-between items-center z-10 pt-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                        <span className="text-white font-bold text-2xl tracking-tighter">M</span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
                        maquinita<span className="text-primary-500">.</span>
                    </h1>
                </div>
                <div className="flex bg-white/5 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-slate-300">Online & Ready</span>
                </div>
            </header>

            {/* Main Action Area */}
            <main className="flex-1 flex flex-col items-center justify-center z-10 w-full max-w-2xl px-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="text-center space-y-6 mb-16"
                >
                    <h2 className="text-5xl md:text-7xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 leading-tight pb-2">
                        Comida Fresca, <br />Sin Filas.
                    </h2>
                    <p className="text-xl md:text-2xl text-slate-400 font-medium max-w-lg mx-auto leading-relaxed">
                        Desbloquea, toma lo que quieras y vete. Nosotros cobramos automáticamente.
                    </p>
                </motion.div>

                {/* Animated Tap Area */}
                <div className="relative">
                    <AnimatePresence>
                        {tapActive && (
                            <motion.div
                                initial={{ opacity: 0.5, scale: 0.8 }}
                                animate={{ opacity: 0, scale: 1.5 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 1.2, ease: "easeOut" }}
                                className="absolute inset-0 bg-primary-500/30 rounded-full z-0"
                            />
                        )}
                    </AnimatePresence>

                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="relative z-10 bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 p-8 rounded-[2rem] shadow-2xl shadow-black/50 flex flex-col items-center gap-6 cursor-pointer"
                        onClick={handleSimulatedTap}
                    >
                        <div className="flex gap-4 items-center">
                            <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 shadow-inner">
                                <CreditCard className="w-10 h-10 text-primary-400" />
                            </div>
                            <div className="p-4 bg-slate-800 rounded-2xl border border-slate-700 shadow-inner">
                                <Smartphone className="w-10 h-10 text-emerald-400" />
                            </div>
                        </div>

                        <div className="text-center">
                            <h3 className="text-2xl font-bold text-white mb-1">Presenta para abrir</h3>
                            <p className="text-slate-400 font-medium">Tarjeta física, Apple Pay o Google Pay</p>
                        </div>

                        <div className="flex items-center gap-2 text-primary-400 font-semibold mt-2 group">
                            <span>Simular Tap (Click aquí)</span>
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </motion.div>

                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={(e) => { e.stopPropagation(); setMachineState('menu'); }}
                        className="mt-8 w-full border border-slate-700 bg-slate-800/50 hover:bg-slate-800 backdrop-blur-md text-white font-bold py-4 rounded-[1.5rem] shadow-lg flex items-center justify-center gap-2 transition-colors relative z-20"
                    >
                        Ver Catálogo de Productos
                        <ArrowRight className="w-5 h-5" />
                    </motion.button>
                </div>
            </main>

            {/* Footer */}
            <footer className="w-full flex justify-between items-center z-10 pb-4 text-slate-500 font-medium">
                <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full backdrop-blur-sm border border-white/5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Pagos Seguros por Stripe</span>
                </div>
                <span>¿Ayuda? 1-800-MAQUINA</span>
            </footer>
        </div>
    );
}
