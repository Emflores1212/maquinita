import cv2
import time
import os

def start_camera_stream():
    print("[Vision AI] Inicializando conexión con la cámara...")
    
    # 0 es usualmente la cámara integrada o la cámara USB principal en RPi
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("[Error] No se pudo acceder a la cámara. Revisa las conexiones físicas o los permisos (video group).")
        # Fallback Mock para pruebas sin cámara
        print("[Mock] Simulando frame de captura para debug...")
        return
        
    print("[Vision AI] Cámara lista. Presiona 'q' en la ventana para salir.")
    
    # Configurar resolución (opcional, para YOLO es mejor usar resoluciones bajas/medias para mejorar FPS en Raspberry Pi)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    # Algunas cámaras limitan el framerate, intenta 30fps
    cap.set(cv2.CAP_PROP_FPS, 30)

    try:
        frames_capturados = 0
        inicio = time.time()
        
        while True:
            ret, frame = cap.read()
            
            if not ret:
                print("[Error] No se pudo leer un frame de la cámara. Saliendo...")
                break
                
            frames_capturados += 1
            
            # TODO: Aquí inyectaremos YOLOv8 o similar más adelante, para hacer inferencia sobre el tensor `frame`
            
            # Dibujar un texto de debug en pantalla
            cv2.putText(frame, "Maquinita AI Stream - PoC", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, f"Frames: {frames_capturados}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
            
            # Mostrar la ventana (solo útil si el RPi o la Mac tiene GUI activo, sino se corre headless y se omite esto)
            if os.environ.get('DISPLAY') or os.name == 'posix': # posix suele incluir macOS
                 cv2.imshow('Maquinita Edge Vision', frame)
            elif frames_capturados % 30 == 0:
                 print(f"[Vision AI Headless] Frame {frames_capturados} procesado correctamente.")
            
            # Presionar 'q' para salir
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
                
    except KeyboardInterrupt:
        print("\n[Vision AI] Streaming interrumpido por el usuario (Ctrl+C).")
    finally:
        # Liberar recursos
        cap.release()
        cv2.destroyAllWindows()
        fin = time.time()
        print(f"[Vision AI] Finalizado. Se procesaron {frames_capturados} frames en {fin - inicio:.2f} segundos.")

if __name__ == "__main__":
    start_camera_stream()
