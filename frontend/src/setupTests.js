import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// React Router v7 needs these in the jsdom shipped with react-scripts
Object.assign(global, { TextEncoder, TextDecoder });
