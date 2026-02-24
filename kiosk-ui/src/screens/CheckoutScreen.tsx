import { useState, useEffect } from 'react';
import { useKioskStore } from '../store/kioskStore';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight, Loader2, Mail, BadgeCheck } from 'lucide-react';

export default function CheckoutScreen() {
    const { cartTotal, cart, setMachineState, clearCart } = useKioskStore();
    const [email, setEmail] = useState('');
    const [step, setStep] = useState<'processing' | 'receipt' | 'done'>('processing');

    // MOCK: Simular el cobro a la tarjeta autorizada mediante Stripe
    useEffect(() => {
        if (step === 'processing') {
            const timer = setTimeout(() => {
                setStep('receipt');
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [step]);

    const handleSendReceipt = () => {
        // Mover a pantalla de gracias y limpiar MOCK para el siguiente cliente
        setStep('done');
        setTimeout(() => {
            clearCart();
            setMachineState('idle');
        }, 4000);
    };

    const handleSkip = () => {
        setStep('done');
        setTimeout(() => {
            clearCart();
            setMachineState('idle');
        }, 3000);
    };

    return (
        <div className="w-full h-full bg-slate-50 flex items-center justify-center p-8">
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-[2rem] shadow-2xl overflow-hidden w-full max-w-2xl text-slate-900 flex flex-col items-center"
            >
                {step === 'processing' && (
                    <div className="p-16 flex flex-col items-center justify-center text-center w-full min-h-[500px]">
                        <Loader2 className="w-20 h-20 text-primary-500 animate-spin mb-8" />
                        <h2 className="text-3xl font-bold tracking-tight mb-3">Cobrando ${cartTotal().toFixed(2)}</h2>
                        <p className="text-slate-500 text-lg font-medium">Estamos procesando tu pago de forma segura con Stripe...</p>

                        <div className="mt-10 px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3">
                            <span className="flex h-3 w-3 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                            <span className="font-semibold text-slate-700">Comprobando inventario final ({cart.length} items)...</span>
                        </div>
                    </div>
                )}

                {step === 'receipt' && (
                    <div className="flex flex-col w-full h-full min-h-[500px]">
                        <div className="bg-emerald-500 p-10 text-center text-white flex flex-col items-center justify-center">
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                                <CheckCircle2 className="w-24 h-24 mb-4" />
                            </motion.div>
                            <h2 className="text-4xl font-extrabold mb-2">¡Pago Exitoso!</h2>
                            <p className="text-emerald-100 font-medium text-xl">Tu cobro de ${cartTotal().toFixed(2)} fue aprobado.</p>
                        </div>

                        <div className="p-12 flex flex-col items-center bg-white flex-1 text-center">
                            <h3 className="text-2xl font-bold mb-8">¿A dónde enviamos tu recibo?</h3>

                            <div className="w-full max-w-md relative mb-8">
                                <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Ingresa tu email"
                                    className="w-full pl-16 pr-6 py-5 text-xl bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-primary-500 focus:bg-white transition-all font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                                    autoFocus
                                />
                            </div>

                            <div className="flex flex-col w-full max-w-md gap-4">
                                <button
                                    onClick={handleSendReceipt}
                                    disabled={!email.includes('@')}
                                    className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xl font-bold py-5 rounded-2xl shadow-lg transition-colors flex justify-center items-center gap-2"
                                >
                                    Enviar Recibo <ChevronRight className="w-6 h-6" />
                                </button>
                                <button
                                    onClick={handleSkip}
                                    className="w-full text-slate-500 font-bold py-4 hover:text-slate-800 transition-colors"
                                >
                                    No, gracias
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'done' && (
                    <div className="p-16 flex flex-col items-center justify-center text-center w-full min-h-[500px]">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <BadgeCheck className="w-32 h-32 text-primary-500 mb-8" />
                        </motion.div>
                        <h2 className="text-4xl font-extrabold tracking-tight mb-4">¡Gracias por usar Maquinita!</h2>
                        <p className="text-slate-500 text-xl font-medium max-w-md">
                            Que disfrutes tu comida fresca. Nos vemos pronto.
                        </p>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
