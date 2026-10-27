import cv2
import numpy as np
from ultralytics import YOLO
import logging
import os
from PIL import Image
import torch
from utils.depth_estimation import depth_estimator

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def download_model_if_needed(model_path):
    """Download best.pt from HF Space files if not present"""
    if os.path.exists(model_path):
        logger.info(f"Model found at {model_path}")
        return True
    
    try:
        import requests
        logger.info("Downloading best.pt from Hugging Face...")
        
        # Direct download URL from HF Space
        url = "https://huggingface.co/spaces/GaganKI10/pothole-detection-api/resolve/main/models/best.pt"
        
        response = requests.get(url, stream=True, timeout=120)
        response.raise_for_status()
        
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        with open(model_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        size_mb = os.path.getsize(model_path) / (1024 * 1024)
        logger.info(f"Downloaded best.pt successfully ({size_mb:.1f} MB)")
        return True
        
    except Exception as e:
        logger.error(f"Failed to download best.pt: {e}")
        return False


class PotholeDetector:
    def __init__(self, model_path=None):
        self.model = None
        
        DEFAULT_MODEL_PATH = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            'best.pt'
        )
        self.model_path = model_path or DEFAULT_MODEL_PATH
        self.confidence_threshold = 0.25
        self.iou_threshold = 0.45
        self.load_model()

    def load_model(self):
        """Load YOLOv8 model — download from HF if not found"""
        try:
            models_dir = os.path.dirname(os.path.abspath(__file__))
            logger.info(f"Looking for model in: {models_dir}")
            logger.info(f"Files in models dir: {os.listdir(models_dir)}")

            # Try to download if not present
            if not os.path.exists(self.model_path):
                logger.info("best.pt not found locally — attempting download...")
                downloaded = download_model_if_needed(self.model_path)
                
                if not downloaded:
                    logger.error("Download failed. Falling back to pre-trained.")
                    self.model = YOLO('yolov8m.pt')
                    device = 'cuda' if torch.cuda.is_available() else 'cpu'
                    self.model.to(device).model.eval()
                    logger.info(f"YOLOv8 fallback model loaded on {device}.")
                    return

            logger.info(f"Loading custom model from {self.model_path}")
            self.model = YOLO(self.model_path)
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            self.model.to(device).model.eval()
            logger.info(f"YOLOv8 custom model loaded successfully on {device}.")

        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise

    def preprocess_image(self, image):
        if isinstance(image, np.ndarray):
            if len(image.shape) == 3 and image.shape[2] == 3:
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        elif isinstance(image, Image.Image):
            image = np.array(image.convert("RGB"))
        return image

    def detect_potholes(self, image, return_image=False):
        try:
            processed_image = self.preprocess_image(image)
            results = self.model(
                processed_image,
                conf=self.confidence_threshold,
                iou=self.iou_threshold,
                verbose=False
            )
            detections = []
            annotated_image = None

            if results and len(results) > 0:
                result = results[0]
                if result.boxes is not None and len(result.boxes) > 0:
                    boxes = result.boxes.xyxy.cpu().numpy()
                    confidences = result.boxes.conf.cpu().numpy()
                    classes = result.boxes.cls.cpu().numpy()
                    for i, (box, conf, cls) in enumerate(zip(boxes, confidences, classes)):
                        detections.append({
                            'bbox_xyxy': [int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                            'confidence': float(conf),
                            'class_id': int(cls),
                        })
                if return_image:
                    annotated_image = result.plot()

            return {
                'success': True,
                'detections': detections,
                'annotated_image': annotated_image,
                'image_shape': processed_image.shape,
                'raw_image_array': processed_image
            }

        except Exception as e:
            logger.error(f"Error during YOLO detection: {e}")
            return {'success': False, 'error': str(e), 'detections': []}

    def process_image_for_api(self, image_array, latitude=None, longitude=None):
        try:
            detection_results = self.detect_potholes(image_array, return_image=True)
            if not detection_results['success']:
                return detection_results

            raw_detections = detection_results['detections']
            processed_potholes = []

            for detection in raw_detections:
                x1, y1, x2, y2 = detection['bbox_xyxy']
                severity_info = depth_estimator.analyze_pothole_depth(
                    image_array, (x1, y1, x2, y2)
                )
                pothole_data = {
                    'bbox_xyxy': detection['bbox_xyxy'],
                    'confidence': round(detection['confidence'], 4),
                    'severity': severity_info['severity'],
                    'depth_estimate_m': round(severity_info['depth'], 4) if severity_info['depth'] is not None else None,
                    'priority': severity_info['priority']
                }
                if latitude is not None and longitude is not None:
                    pothole_data['latitude'] = latitude
                    pothole_data['longitude'] = longitude
                processed_potholes.append(pothole_data)

            logger.info(f"Successfully processed {len(processed_potholes)} potholes.")
            return {
                'success': True,
                'potholes': processed_potholes,
                'total_filtered': len(processed_potholes),
                'annotated_image': detection_results['annotated_image']
            }

        except Exception as e:
            logger.error(f"Critical error in processing pipeline: {e}")
            return {'success': False, 'error': f"Critical processing error: {e}", 'potholes': []}


pothole_detector = PotholeDetector()