import time

try:
    import RPi.GPIO as GPIO
except ImportError:
    print("Este script necesita 'RPi.GPIO' instalado. Solo correrá correctamente dentro del Raspberry Pi.")
    # Usaremos una clase dummy para que no de error al probar la lógica en la Mac
    class DummyGPIO:
        BCM = 'BCM'
        OUT = 'OUT'
        LOW = 0
        HIGH = 1
        @staticmethod
        def setmode(mode): print(f"[MOC] setmode({mode})")
        @staticmethod
        def setup(pin, mode): print(f"[MOC] setup(pin={pin}, mode={mode})")
        @staticmethod
        def output(pin, state): print(f"[MOC] GPIO pin {pin} -> estado {'ALTO (Abierto)' if state else 'BAJO (Cerrado)'}")
        @staticmethod
        def cleanup(): print("[MOC] GPIO cleanup()")
        
    GPIO = DummyGPIO

# Usualmente el módulo de relé se conecta a uno de los pines GPIO. Ej: 17
RELAY_PIN = 17

def setup():
    # Usar la numeración de pines estándar de Broadcom
    GPIO.setmode(GPIO.BCM)
    # Configurar nuestro pin como salida
    GPIO.setup(RELAY_PIN, GPIO.OUT)
    # Asegurar que empieza apagado (normalmente cerrado)
    GPIO.output(RELAY_PIN, GPIO.LOW)

def unlock_door(seconds=5):
    print(f"\n--- Iniciando Apertura de Puerta ---")
    print(f"Abriendo cerradura por {seconds} segundos...")
    GPIO.output(RELAY_PIN, GPIO.HIGH)
    
    time.sleep(seconds)
    
    print("Tiempo agotado. Cerrando cerradura...")
    GPIO.output(RELAY_PIN, GPIO.LOW)
    print(f"--- Puerta Asegurada ---\n")

if __name__ == '__main__':
    try:
        setup()
        unlock_door(seconds=3)
    except KeyboardInterrupt:
        print("\nInterrumpido por el usuario")
    finally:
        # Siempre limpiar los pines al salir
        GPIO.cleanup()
