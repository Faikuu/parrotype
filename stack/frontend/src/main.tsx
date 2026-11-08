import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

function Placeholder() {
  return <p>ParroType</p>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
