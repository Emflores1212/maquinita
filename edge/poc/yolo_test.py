import cv2
from ultralytics import YOLO
import time
import os

def start_ai_vision():
    print("[Maquinita Vision AI] Iniciando modelo YOLOv8n...")
    
    # Cargar el modelo base pre-entrenado (nano, muy ligero y rápido para Raspberry Pi)
    try:
        model = YOLO('yolov8n.pt') 
    except Exception as e:
        print(f"[Error] Fallo al cargar el modelo YOLO. ¿Hay conexión a internet para descargarlo la primera vez? Error: {e}")
        return

    print("[Maquinita Vision AI] Modelo Cargado. Abriendo cámara...")
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("[Error] No se pudo acceder a la cámara local.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            # Ejecutar Inferencia usando YOLO
            # persist=True es útil para tracking si usamos model.track() pero predict es simple
            results = model.predict(source=frame, conf=0.5, verbose=False)
            
            # Dibujar los resultados (BBoxes y Labels) sobre la imagen
            annotated_frame = results[0].plot()
            
            # Deteccion de clases
            detected_names = [model.names[int(box.cls)] for box in results[0].boxes]
            
            # En nuestro caso de uso, YOLO detectaría "Manzana", "Botella", "Sandwich"
            # Cruzaríamos esto con el lector RFID para la Fusión de Sensores
            if detected_names:
                print(f"[AI Scanner] Detectado: {detected_names}")
                # TODO: Enviar detected_names al backend vía API POST /verify-taking
                
            # Mostrar cuadro para Debug
            if os.environ.get('DISPLAY') or os.name == 'posix':
                 cv2.imshow('Maquinita Product Detection AI', annotated_frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
                
    except KeyboardInterrupt:
        print("\n[Vision AI] Cerrando escáner cognitivo...")
    finally:
        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    start_ai_vision()
