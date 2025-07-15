// contexts/PupilTrackingContext.js
import React, { createContext, useContext, useReducer } from 'react';

const PupilTrackingContext = createContext();

const initialState = {
  isRecording: false,
  pupilData: [],
  landmarks: null,
  error: null
};

function pupilTrackingReducer(state, action) {
  switch (action.type) {
    case 'START_RECORDING':
      return { ...state, isRecording: true, pupilData: [] };
    case 'STOP_RECORDING':
      return { ...state, isRecording: false };
    case 'ADD_PUPIL_DATA':
      return { 
        ...state, 
        pupilData: [...state.pupilData, action.payload] 
      };
    case 'UPDATE_LANDMARKS':
      return { ...state, landmarks: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
}

export function PupilTrackingProvider({ children }) {
  const [state, dispatch] = useReducer(pupilTrackingReducer, initialState);
  
  return (
    <PupilTrackingContext.Provider value={{ state, dispatch }}>
      {children}
    </PupilTrackingContext.Provider>
  );
}

export const usePupilTracking = () => {
  const context = useContext(PupilTrackingContext);
  if (!context) {
    throw new Error('usePupilTracking must be used within PupilTrackingProvider');
  }
  return context;
};