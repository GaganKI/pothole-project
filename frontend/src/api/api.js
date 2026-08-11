import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// File size limit — 10MB max
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed image types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Validate image before sending to API
export const validateImage = (file) => {
  if (!file) return { valid: false, error: 'No file provided' };

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only JPEG, PNG, and WebP images are allowed' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Image must be under 10MB' };
  }

  return { valid: true };
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 second timeout — model inference can be slow
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor — handle common errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      console.error('Request timeout — API took too long to respond');
    }

    if (error.response?.status === 413) {
      console.error('Image too large for server');
    }

    if (error.response?.status >= 500) {
      console.error('Server error — try again later');
    }

    return Promise.reject(error);
  }
);

export const detectPotholes = async (formData) => {
  try {
    const response = await api.post('/detect', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000, // 60s for detection — model inference is slow on CPU
    });

    return response.data;
  } catch (error) {
    console.error('Error detecting potholes:', error);
    throw error;
  }
};

// Save pothole data to database
export const savePothole = async (formData) => {
  try {
    const response = await api.post('/api/save_pothole', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    return response.data;
  } catch (error) {
    console.error('Error saving pothole:', error);
    // Don't throw — saving failure shouldn't break the detection flow
    return null;
  }
};

export const getAllPotholes = async (limit = 1000) => {
  try {
    // Sanitise limit — never allow arbitrary large values
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 1000), 5000);

    const response = await api.get(`/potholes?limit=${safeLimit}`);

    return response.data;
  } catch (error) {
    console.error('Error fetching potholes:', error);
    throw error;
  }
};

export const getPotholesInBounds = async (bounds) => {
  // Validate bounds before sending
  const { north, south, east, west } = bounds;

  if (
    typeof north !== 'number' || typeof south !== 'number' ||
    typeof east !== 'number' || typeof west !== 'number'
  ) {
    throw new Error('Invalid bounds — all values must be numbers');
  }

  if (north <= south) throw new Error('North must be greater than south');
  if (east <= west) throw new Error('East must be greater than west');

  try {
    const response = await api.post('/potholes/bounds', {
      north,
      south,
      east,
      west
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching potholes in bounds:', error);
    throw error;
  }
};

export const getImageUrl = (imagePath) => {
  if (!imagePath) return null;

  // Prevent path traversal — only allow paths starting with /images/
  if (!imagePath.startsWith('/images/')) return null;

  return `${API_BASE_URL}${imagePath}`;
};

export default api;