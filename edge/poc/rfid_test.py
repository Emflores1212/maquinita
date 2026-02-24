import serial
import time

# NOTA: En la Mac podría verse como '/dev/cu.usbserial-XXXX', en la Pi será '/dev/ttyUSB0' o '/dev/ttyACM0'
SERIAL_PORT = '/dev/cu.usbserial-0001' # Cambiar en el Raspberry Pi
BAUD_RATE = 115200

def listen_to_rfid():
    try:
        # Abre la conexión serial al módulo RFID (asumiendo módulo UART/RS232)
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        print(f"Exito: Escuchando el lector RFID en {SERIAL_PORT}")
    except serial.SerialException as e:
        print(f"\n[!] Error abriendo el puerto serial: {e}")
        print("\nPara correr en la Mac, intenta:")
        print("  1. ls /dev/cu.*  (para ver los puertos disponibles)")
        print("  2. Cambia 'SERIAL_PORT' a como se llame tu adaptador.")
        print("En la Raspberry Pi, usualmente será '/dev/ttyUSB0'.")
        return

    print("Esperando lecturas de etiquetas RFID... (Presiona Ctrl+C para finalizar)\n")
    try:
        while True:
            # Si hay información esperando ser leída en el buffer
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting)
                
                # La data que envía el RFID usualmente es cruda (hexadecimal)
                # Parsear estos bytes dependerá del protocolo del fabricante del lector (EPC Gen 2, Chafon, etc.)
                hex_data = data.hex().upper()
                print(f"[NUEVA LECTURA] Raw Bytes recibidos: {hex_data}")
                
            time.sleep(0.05) # Pequeña pausa para no sobrecargar CPU
            
    except KeyboardInterrupt:
        print("\nDeteniendo lectura...")
    finally:
        ser.close()

if __name__ == '__main__':
    listen_to_rfid()
