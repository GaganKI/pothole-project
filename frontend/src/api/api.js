import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const detectPotholes = async (formData) => {
  try {
    const response = await api.post('/detect', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error detecting potholes:', error);
    throw error;
  }
};

export const getAllPotholes = async () => {
  try {
    const response = await api.get('/potholes');
    return response.data;
  } catch (error) {
    console.error('Error fetching potholes:', error);
    throw error;
  }
};

export const getPotholesInBounds = async (bounds) => {
  try {
    const response = await api.post('/potholes/bounds', bounds);
    return response.data;
  } catch (error) {
    console.error('Error fetching potholes in bounds:', error);
    throw error;
  }
};

// Uses the top-level API_BASE_URL — no duplicate declaration needed
export const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  return `${API_BASE_URL}${imagePath}`;
};

export default api;