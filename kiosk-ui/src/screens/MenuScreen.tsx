import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useKioskStore, type Product } from '../store/kioskStore';
import { ArrowLeft, Flame, Info, ChevronRight, X, Package } from 'lucide-react';

const MENU_ITEMS: Product[] = [
    {
        id: 101,
        name: "Ensalada César con Pollo",
        price: 8.50,
        image_url: "https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&q=80&w=800",
        description: "Clásica ensalada césar con pechuga de pollo asada, crutones caseros, queso parmesano y aderezo cremoso. Preparada fresca todas las mañanas.",
        nutritional_info: { calories: 350, protein: "25g", carbs: "12g", fat: "20g" },
        stock: 5
    },
    {
        id: 102,
        name: "Wrap de Atún Picante",
        price: 7.00,
        image_url: "https://images.unsplash.com/photo-1626844131082-256783844137?auto=format&fit=crop&q=80&w=800",
        description: "Wrap integral relleno de ensalada de atún con mayonesa picante sriracha, lechuga crujiente y zanahoria rallada.",
        nutritional_info: { calories: 420, protein: "22g", carbs: "45g", fat: "15g" },
        stock: 0
    },
    {
        id: 105,
        name: "Lasaña de Carne Clásica",
        price: 9.50,
        image_url: "https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&q=80&w=800",
        description: "Capas de pasta con rica salsa boloñesa, queso ricotta, mozzarella y parmesano.",
        heating_instructions: "Quita la tapa. Calienta en microondas a máxima potencia por 2:30 a 3 minutos. Deja reposar 1 minuto.",
        nutritional_info: { calories: 650, protein: "30g", carbs: "55g", fat: "28g" },
        stock: 3
    },
    {
        id: 103,
        name: "Jugo Prensado Verde Detox",
        price: 4.50,
        image_url: "https://images.unsplash.com/photo-1600271886742-f049cd451bba?auto=format&fit=crop&q=80&w=800",
        description: "Mezcla refrescante de manzana verde, apio, espinaca, pepino y un toque de jengibre y limón.",
        nutritional_info: { calories: 120, protein: "2g", carbs: "28g", fat: "0g" },
        stock: 8
    },
    {
        id: 104,
        name: "Bowl de Frutas de Temporada",
        price: 5.00,
        image_url: "https://images.unsplash.com/photo-1490474418585-ba9f528d8ebe?auto=format&fit=crop&q=80&w=800",
        description: "Selección de frutas frescas cortadas diariamente que incluyen fresas, melón, arándanos y piña.",
        nutritional_info: { calories: 95, protein: "1g", carbs: "22g", fat: "0g" },
        stock: 12
    },
    {
        id: 106,
        name: "Sándwich de Pavo y Queso Suizo",
        price: 6.50,
        image_url: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&q=80&w=800",
        description: "Pan artesanal de masa madre con pavo ahumado, queso suizo, lechuga y aderezo de mostaza miel.",
        nutritional_info: { calories: 480, protein: "28g", carbs: "50g", fat: "16g" },
        stock: 4
    }
];

export default function MenuScreen() {
    const { setMachineState } = useKioskStore();
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

    return (
        <div className="w-full h-full bg-slate-50 flex flex-col relative overflow-hidden">
            {/* Header */}
            <header className="bg-slate-900 text-white p-6 pb-8 flex items-center justify-between shadow-md z-10 relative">
                <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-r from-primary-500 via-indigo-500 to-emerald-500" />
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setMachineState('idle')}
                        className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Menú de Productos</h2>
                        <p className="text-slate-400 font-medium mt-1">Descubre lo que hay fresco hoy en la nevera.</p>
                    </div>
                </div>

                <button
                    onClick={() => setMachineState('authorizing')}
                    className="bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary-500/20 transition-transform active:scale-95"
                >
                    Desbloquear Nevera
                    <ChevronRight className="w-5 h-5" />
                </button>
            </header>

            {/* Product Grid */}
            <main className="flex-1 overflow-y-auto p-8 relative">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {MENU_ITEMS.map((product, idx) => (
                        <motion.div
                            key={product.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            whileHover={{ y: -5, scale: 1.02 }}
                            onClick={() => setSelectedProduct(product)}
                            className="bg-white rounded-[2rem] overflow-hidden shadow-xl shadow-slate-200/50 cursor-pointer border border-slate-100 group flex flex-col h-full"
                        >
                            <div className="h-56 overflow-hidden relative bg-slate-100">
                                {product.image_url ? (
                                    <img
                                        src={product.image_url}
                                        alt={product.name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                        No Image
                                    </div>
                                )}

                                {product.stock === 0 && (
                                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                                        <div className="bg-slate-900 text-white px-4 py-2 rounded-full font-bold text-sm tracking-widest uppercase">
                                            Agotado
                                        </div>
                                    </div>
                                )}

                                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl font-black text-slate-900 shadow-sm">
                                    ${product.price.toFixed(2)}
                                </div>
                            </div>

                            <div className="p-6 flex-1 flex flex-col justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900 leading-tight mb-2">{product.name}</h3>
                                    <p className="text-slate-500 font-medium text-sm line-clamp-2">{product.description}</p>
                                </div>
                                <div className="mt-4 flex items-center justify-between text-sm font-semibold">
                                    {product.stock && product.stock > 0 ? (
                                        <span className="text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg">
                                            <Package className="w-4 h-4" />
                                            {product.stock} disponibles
                                        </span>
                                    ) : (
                                        <span className="text-slate-400">—</span>
                                    )}
                                    <span className="text-primary-600 group-hover:underline underline-offset-4 decoration-2">Ver detalles</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Product Detail Modal */}
                <AnimatePresence>
                    {selectedProduct && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedProduct(null)}
                                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
                            />
                            <motion.div
                                initial={{ opacity: 0, y: "100%" }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: "100%" }}
                                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                                className="absolute bottom-0 inset-x-0 h-[85%] bg-white rounded-t-[3rem] z-50 shadow-2xl flex flex-col overflow-hidden"
                            >
                                <div className="w-full h-72 bg-slate-100 relative shrink-0">
                                    {selectedProduct.image_url && (
                                        <img
                                            src={selectedProduct.image_url}
                                            alt={selectedProduct.name}
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                    <button
                                        onClick={() => setSelectedProduct(null)}
                                        className="absolute top-6 right-6 p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white rounded-full transition-colors"
                                    >
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <div className="p-8 md:p-12 overflow-y-auto flex-1">
                                    <div className="max-w-4xl mx-auto">
                                        <div className="flex justify-between items-start gap-4 mb-6">
                                            <h2 className="text-4xl font-extrabold text-slate-900 leading-tight">
                                                {selectedProduct.name}
                                            </h2>
                                            <span className="text-3xl font-black text-primary-600 shrink-0">
                                                ${selectedProduct.price.toFixed(2)}
                                            </span>
                                        </div>

                                        <p className="text-xl text-slate-600 font-medium leading-relaxed mb-10">
                                            {selectedProduct.description}
                                        </p>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            {selectedProduct.heating_instructions && (
                                                <div className="bg-orange-50 rounded-3xl p-6 border border-orange-100 text-orange-900 block">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        <Flame className="w-6 h-6 text-orange-500" />
                                                        <h4 className="font-bold text-lg">Instrucciones para calentar</h4>
                                                    </div>
                                                    <p className="font-medium text-orange-800/80 leading-relaxed">
                                                        {selectedProduct.heating_instructions}
                                                    </p>
                                                </div>
                                            )}

                                            {selectedProduct.nutritional_info && (
                                                <div className="bg-slate-50 rounded-3xl p-6 border border-slate-100 text-slate-900 block">
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <Info className="w-6 h-6 text-slate-500" />
                                                        <h4 className="font-bold text-lg">Información Nutricional</h4>
                                                    </div>

                                                    <div className="grid grid-cols-4 gap-4">
                                                        <div className="text-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                                                            <div className="text-2xl font-black text-slate-900">{selectedProduct.nutritional_info.calories}</div>
                                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">CAL</div>
                                                        </div>
                                                        <div className="text-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                                                            <div className="text-xl font-bold text-slate-700">{selectedProduct.nutritional_info.protein}</div>
                                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">PROT</div>
                                                        </div>
                                                        <div className="text-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                                                            <div className="text-xl font-bold text-slate-700">{selectedProduct.nutritional_info.carbs}</div>
                                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">CARBS</div>
                                                        </div>
                                                        <div className="text-center p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                                                            <div className="text-xl font-bold text-slate-700">{selectedProduct.nutritional_info.fat}</div>
                                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Grasa</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-20px_25px_-5px_rgba(0,0,0,0.05)]">
                                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                                        <div className="font-semibold text-slate-500">
                                            {selectedProduct.stock === 0 ? "Producto Agotado" : "Abre la nevera para tomarlo"}
                                        </div>
                                        <button
                                            onClick={() => {
                                                setSelectedProduct(null);
                                                setMachineState('authorizing');
                                            }}
                                            disabled={selectedProduct.stock === 0}
                                            className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold text-lg transition-transform active:scale-95 shadow-xl shadow-slate-900/20"
                                        >
                                            {selectedProduct.stock === 0 ? "Agotado" : "Desbloquear Nevera"}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
