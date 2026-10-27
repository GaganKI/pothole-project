from flask import Blueprint, request, jsonify, send_from_directory
import os
import json
import logging
from werkzeug.utils import secure_filename
from database.db import db_manager

pothole_save_bp = Blueprint('pothole_save', __name__)
logger = logging.getLogger(__name__)

# Read images directory from environment — not hardcoded
IMAGES_DIR = os.getenv('IMAGES_DIR', os.path.join(os.getcwd(), 'pothole_images'))

# Create directory if it doesn't exist
os.makedirs(IMAGES_DIR, exist_ok=True)


@pothole_save_bp.route('/api/save_pothole', methods=['POST'])
def save_pothole():
    """Save pothole data + image (base64 in DB + local file)"""
    try:
        pothole_data_json = request.form.get('pothole_data')
        if not pothole_data_json:
            return jsonify({'success': False, 'error': 'No pothole data provided'}), 400

        pothole_data = json.loads(pothole_data_json)

        required = ['pothole_id', 'survey_name', 'confidence']
        for field in required:
            if field not in pothole_data:
                return jsonify({'success': False, 'error': f'Missing: {field}'}), 400

        image_url   = None
        image_data  = None  # base64 string

        if 'pothole_image' in request.files:
            image_file = request.files['pothole_image']
            if image_file and image_file.filename:
                # Read image bytes
                img_bytes = image_file.read()

                # 1. Save to local filesystem (works locally)
                filename = secure_filename(f"{pothole_data['pothole_id']}.jpg")
                filepath = os.path.join(IMAGES_DIR, filename)
                with open(filepath, 'wb') as f:
                    f.write(img_bytes)
                image_url = f"/images/{filename}"
                logger.info(f"Image saved locally: {filepath}")

                # 2. Encode as base64 for DB storage (survives container restart)
                import base64
                image_data = f"data:image/jpeg;base64,{base64.b64encode(img_bytes).decode('utf-8')}"
                logger.info(f"Image encoded as base64 ({len(img_bytes)} bytes)")

        db_pothole_data = {
            'pothole_id':      pothole_data['pothole_id'],
            'survey_name':     pothole_data['survey_name'],
            'detection_type':  pothole_data.get('detection_type', 'capture'),
            'latitude':        pothole_data.get('latitude'),
            'longitude':       pothole_data.get('longitude'),
            'confidence':      pothole_data['confidence'],
            'depth':           pothole_data.get('depth'),
            'bbox_x':          pothole_data.get('bbox', [None]*4)[0],
            'bbox_y':          pothole_data.get('bbox', [None]*4)[1],
            'bbox_width':      pothole_data.get('bbox', [None]*4)[2],
            'bbox_height':     pothole_data.get('bbox', [None]*4)[3],
            'area_description':pothole_data.get('area', 'Unknown'),
            'image_url':       image_url,
            'image_data':      image_data,   # stored in DB
        }

        result = db_manager.insert_pothole(db_pothole_data)

        return jsonify({
            'success':    True,
            'message':    'Pothole saved',
            'pothole_id': pothole_data['pothole_id'],
            'database_id':result['id'],
            'image_url':  image_url,
            'image_in_db':image_data is not None,
        }), 200

    except json.JSONDecodeError:
        return jsonify({'success': False, 'error': 'Invalid JSON in pothole_data'}), 400
    except Exception as e:
        logger.error(f"Error saving pothole: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@pothole_save_bp.route('/images/<filename>')
def serve_image(filename):
    """Serve image — local file first, DB base64 fallback"""
    try:
        # Try local file first
        local_path = os.path.join(IMAGES_DIR, secure_filename(filename))
        if os.path.exists(local_path):
            return send_from_directory(IMAGES_DIR, secure_filename(filename))

        # Fallback: get from DB
        pothole_id = filename.replace('.jpg', '').replace('.jpeg', '').replace('.png', '')
        pothole = db_manager.get_pothole_by_id(pothole_id)

        if pothole and pothole.get('image_data'):
            import base64
            # Strip data URI prefix
            img_data = pothole['image_data']
            if ',' in img_data:
                img_data = img_data.split(',', 1)[1]
            img_bytes = base64.b64decode(img_data)
            from flask import Response
            return Response(img_bytes, mimetype='image/jpeg')

        return jsonify({'error': 'Image not found'}), 404

    except Exception as e:
        logger.error(f"Error serving image {filename}: {e}")
        return jsonify({'error': 'Image not found'}), 404