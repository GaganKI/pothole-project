import cv2
import numpy as np
import torch
import torch.nn.functional as F
import logging
import random 

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- MiDaS Integration Setup ---
midas = None
transform = None
midas_device = 'cpu'

try:
    logger.info("Attempting to load MiDaS model from PyTorch Hub...")
    midas = torch.hub.load('intel-isl/MiDaS', 'MiDaS_small', pretrained=True)
    midas_device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    midas.to(midas_device)
    midas.eval()
    
    midas_transforms = torch.hub.load('intel-isl/MiDaS', 'transforms')
    if hasattr(midas_transforms, 'small_transform'):
        transform = midas_transforms.small_transform
    else:
        transform = None
        
    logger.info(f"MiDaS model loaded successfully on {midas_device}.")
    
except Exception as e:
    logger.warning(f"MiDaS model loading failed. Using placeholder depth. Error: {e}")

class DepthEstimator:
    def __init__(self):
        self.midas = midas
        self.transform = transform
        self.device = midas_device
        self.is_placeholder = self.midas is None
        
        if self.is_placeholder and self.transform is None:
            logger.warning("Depth Estimator is running in PLACEHOLDER/MOCK mode.")
            self.transform = self._mock_transform

    def _mock_transform(self, image_array):
        if len(image_array.shape) == 3:
            return cv2.cvtColor(image_array, cv2.COLOR_BGR2RGB)
        return image_array

    def _placeholder_depth_estimation(self, image_array, bbox):
        x1, y1, x2, y2 = map(int, bbox)
        roi = image_array[y1:y2, x1:x2].copy()
        
        if roi.size == 0:
            return {'depth_value': 0.0, 'depth_score': 0.0, 'method': 'placeholder'}

        if len(roi.shape) == 3:
            gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        else:
            gray = roi
        
        mean_intensity = np.mean(gray)
        std_intensity = np.std(gray)
        
        depth_score = (255 - mean_intensity) / 255.0 * (std_intensity / 50.0)
        depth_score = np.clip(depth_score, 0.05, 0.8) 
        
        estimated_depth_m = depth_score * 0.3 
        estimated_depth_m = max(0.01, estimated_depth_m + random.uniform(-0.01, 0.01))
        
        return {
            'depth_value': float(estimated_depth_m),
            'depth_score': float(depth_score),
            'method': 'placeholder'
        }

    def _midas_depth_estimation(self, image_array, bbox):
        x1, y1, x2, y2 = map(int, bbox)
        # ✅ FIX: Make a copy to avoid buffer poisoning
        pothole_region = image_array[y1:y2, x1:x2].copy()

        if pothole_region.size == 0 or self.transform is None:
            return {'depth_value': 0.0, 'depth_score': 0.0, 'method': 'midas_failed'}

        pothole_region_rgb = cv2.cvtColor(pothole_region, cv2.COLOR_BGR2RGB)
        input_batch = self.transform(pothole_region_rgb).to(self.device)

        with torch.no_grad():
            prediction = self.midas(input_batch)
            
            # ✅ FIX: Handle dimensions cleanly to prevent interpolation crashes
            if len(prediction.shape) == 3:
                prediction = prediction.unsqueeze(1)  # Shape becomes [1, 1, H, W]
                
            prediction = F.interpolate(
                prediction,
                size=pothole_region.shape[:2],
                mode="bicubic",
                align_corners=False,
            ).squeeze()

        # Convert back to numpy array safely
        depth_map = prediction.cpu().numpy()
        
        max_depth = np.max(depth_map)
        min_depth = np.min(depth_map)
        
        if max_depth == min_depth:
            normalized_depth = np.zeros_like(depth_map)
        else:
            normalized_depth = (max_depth - depth_map) / (max_depth - min_depth)
        
        avg_depth_score = np.mean(normalized_depth)
        estimated_depth_m = avg_depth_score * 0.3 
            
        return {
            'depth_value': float(estimated_depth_m),
            'depth_score': float(avg_depth_score),
            'method': 'midas'
        }

    def analyze_pothole_depth(self, image_array, pothole_bbox):
        try:
            if self.is_placeholder:
                depth_result = self._placeholder_depth_estimation(image_array, pothole_bbox)
            else:
                depth_result = self._midas_depth_estimation(image_array, pothole_bbox)

            depth_value = depth_result.get('depth_value')
            
            if depth_value is not None:
                if depth_value > 0.15:
                    severity = 'CRITICAL'
                    priority = 4
                elif depth_value > 0.08:
                    severity = 'SEVERE'
                    priority = 3
                elif depth_value > 0.04:
                    severity = 'MODERATE'
                    priority = 2
                else:
                    severity = 'MINOR'
                    priority = 1
                
                return {
                    'depth': round(depth_value, 4),
                    'severity': severity,
                    'priority': priority, 
                    'confidence': round(depth_result.get('depth_score', 0.5), 4) 
                }
        except Exception as e:
            logger.error(f"Failed during depth analysis: {e}")
            
        return {
            'depth': None,
            'severity': 'UNKNOWN',
            'priority': 0,
            'confidence': 0.0
        }

depth_estimator = DepthEstimator()
