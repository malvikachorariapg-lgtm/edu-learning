import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./services/api', () => ({
  getAllCourses: () => Promise.resolve({ data: { data: [] } })
}));

test('renders the Edu Learning landing page', async () => {
  render(<App />);
  expect(await screen.findByText(/Skills that/i)).toBeInTheDocument();
});
