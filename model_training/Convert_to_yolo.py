import os
import json
import shutil
from tqdm import tqdm

def convert_folder(root_dir, out_dir, folder_name):
    """
    Converts a single folder (e.g., 'ds1_simplex-train') from the
    DatasetNinja JSON format to YOLO format.

    Args:
        root_dir (str): The root directory of the dataset.
        out_dir (str): The output directory for the YOLO dataset.
        folder_name (str): The name of the subfolder to process.
    """
    print(f"\n--- Processing folder: {folder_name} ---")

    ann_dir = os.path.join(root_dir, folder_name, "ann")
    img_dir = os.path.join(root_dir, folder_name, "img")

    # Create output directories for images and labels
    out_label_dir = os.path.join(out_dir, "labels", folder_name)
    out_image_dir = os.path.join(out_dir, "images", folder_name)
    os.makedirs(out_label_dir, exist_ok=True)
    os.makedirs(out_image_dir, exist_ok=True)

    # Check if annotation folder exists
    if not os.path.exists(ann_dir):
        print(f"⚠ Skipping {folder_name} - annotation folder not found: {ann_dir}")
        return 0, 0

    ann_files = os.listdir(ann_dir)

    # Check if annotation folder is empty
    if not ann_files:
        print(f"⚠ Skipping {folder_name} - annotation folder is empty.")
        return 0, 0

    converted, negative = 0, 0
    
    # Process each annotation file
    for file in tqdm(ann_files, desc=f"Processing {folder_name}"):
        # Check for JSON extension (case-insensitive)
        if not file.lower().endswith(".json"):
            print(f"Skipping non-JSON file: {file}")
            continue

        json_path = os.path.join(ann_dir, file)
        
        # Load the JSON data
        try:
            with open(json_path, "r") as f:
                data = json.load(f)
        except json.JSONDecodeError:
            print(f"Skipping malformed JSON file: {file}")
            continue

        # Correctly get the image name by removing the '.json' extension
        # This fixes the double extension bug
        img_name = file.replace('.json', '')
        img_path = os.path.join(img_dir, img_name)

        # Check if corresponding image exists
        if not os.path.exists(img_path):
            print(f"Skipping {file} - corresponding image not found: {img_path}")
            continue

        width, height = data["size"]["width"], data["size"]["height"]
        yolo_lines = []

        # Convert annotations to YOLO format
        for obj in data.get("objects", []):
            if "points" not in obj or "exterior" not in obj["points"]:
                continue
            
            x1, y1 = obj["points"]["exterior"][0]
            x2, y2 = obj["points"]["exterior"][1]

            # Convert to YOLO normalized format (center_x, center_y, width, height)
            x_center = ((x1 + x2) / 2) / width
            y_center = ((y1 + y2) / 2) / height
            w = abs(x2 - x1) / width
            h = abs(y2 - y1) / height

            class_id = 0  # Assuming 'pothole' is class 0
            yolo_lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}")

        # Write label file and copy image
        label_path = os.path.join(out_label_dir, os.path.splitext(os.path.basename(img_name))[0] + ".txt")
        if yolo_lines:
            with open(label_path, "w") as f:
                f.write("\n".join(yolo_lines))
            converted += 1
        else:
            with open(label_path, "w") as f:
                pass
            negative += 1

        shutil.copy2(img_path, os.path.join(out_image_dir, img_name))

    print(f"✅ {converted} positive and {negative} negative samples processed for {folder_name}")
    return converted, negative

# --- Main execution ---
if __name__ == "__main__":
    # Define input and output directories
    ROOT_DIR = r"D:\Pothole Training\datasets\road-pothole-images-DatasetNinja"
    OUT_DIR = r"D:\Pothole Training\datasets\datasetninja_yolo"

    # List of subfolders to process
    folders_to_process = ["ds1_simplex-train", "ds1_simplex-test", "ds2_complex-train", "ds2_complex-test"]

    total_pos, total_neg = 0, 0
    
    # Process each folder and accumulate counts
    for folder in folders_to_process:
        # The corrected line: passing all three required arguments
        pos, neg = convert_folder(ROOT_DIR, OUT_DIR, folder)
        total_pos += pos
        total_neg += neg

    print(f"\n🎯 Done. {total_pos} positive and {total_neg} negative files total.")
    print(f"Output YOLO dataset located at: {OUT_DIR}")