import cv2
import numpy as np
import os

# --- Configuration (UPDATE THESE PATHS) ---
# 1. CHANGE THIS TO YOUR CRACK500 ROOT FOLDER
ROOT_DIR = r"D:\Pothole Training\datasets\crack500" 
# 2. Assuming masks are in a subfolder like 'Crack500/masks' (Adjust if needed)
MASK_SUBFOLDER = "masks" 
# 3. CHANGE THIS TO YOUR UNIFIED TRAINING LABEL FOLDER
OUTPUT_LABEL_FOLDER = r"D:\Pothole Training\datasets\dataser_final_unified\labels\train"
# 4. Your Pothole Class ID
CLASS_ID = 0 

# --- CRITICAL: Set Image Dimensions for Normalization ---
IMG_WIDTH = 448
IMG_HEIGHT = 448
print(f"Using Image Dimensions for Normalization: {IMG_WIDTH}x{IMG_HEIGHT}")

os.makedirs(OUTPUT_LABEL_FOLDER, exist_ok=True)

def convert_mask_to_yolo_bbox(mask_path, output_path, img_width, img_height):
    """Reads a JPEG mask, finds the bounding box, and writes the YOLO TXT file."""
    try:
        # 1. Read the mask (as grayscale)
        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        
        if mask is None:
            print(f"Skipping: Could not read mask file {mask_path}")
            return False

        # 2. Find contours (white pixels = 255)
        # Use cv2.RETR_EXTERNAL to find only outer contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            # If no white pixels/cracks found, save an empty label file (Negative Sample)
            with open(output_path, 'w') as f:
                pass
            return True

        # 3. Combine all contours to find the single bounding box enclosing all crack areas
        x_min, y_min, x_max, y_max = img_width, img_height, 0, 0
        
        for contour in contours:
            x, y, w, h = cv2.boundingRect(contour)
            x_min = min(x_min, x)
            y_min = min(y_min, y)
            x_max = max(x_max, x + w)
            y_max = max(y_max, y + h)

        # 4. Convert to YOLO normalized format
        x_center = ((x_min + x_max) / 2) / img_width
        y_center = ((y_min + y_max) / 2) / img_height
        width = (x_max - x_min) / img_width
        height = (y_max - y_min) / img_height
        
        # Ensure values are within [0, 1] bounds
        x_center = np.clip(x_center, 0.0, 1.0)
        y_center = np.clip(y_center, 0.0, 1.0)
        width = np.clip(width, 0.0, 1.0)
        height = np.clip(height, 0.0, 1.0)
        
        # 5. Write to YOLO file
        yolo_line = f"{CLASS_ID} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}\n"
        
        with open(output_path, 'w') as f:
            f.write(yolo_line)
            
        return True

    except Exception as e:
        print(f"Error processing {mask_path}: {e}")
        return False

# --- Main Logic to Run Conversion ---
def run_crack500_conversion():
    mask_files_path = os.path.join(ROOT_DIR, MASK_SUBFOLDER)
    if not os.path.isdir(mask_files_path):
        print(f"Error: Mask folder not found at {mask_files_path}")
        return

    mask_files = [f for f in os.listdir(mask_files_path) if f.endswith('.jpg') or f.endswith('.jpeg')]
    
    print(f"Starting conversion of {len(mask_files)} masks...")
    
    for mask_filename in mask_files:
        mask_path = os.path.join(mask_files_path, mask_filename)
        # Label filename is the same as the mask filename, but with a .txt extension
        label_filename = mask_filename.rsplit('.', 1)[0] + '.txt'
        output_path = os.path.join(OUTPUT_LABEL_FOLDER, label_filename)
        
        convert_mask_to_yolo_bbox(mask_path, output_path, IMG_WIDTH, IMG_HEIGHT)
    
    print("Crack500 conversion complete. Labels are saved in the unified training folder.")

if __name__ == "__main__":
    run_crack500_conversion()