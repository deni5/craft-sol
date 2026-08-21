'use client';

import { useState, useEffect } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const stored = localStorage.getItem('craft-sol-theme');
    const initial = stored === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('craft-sol-theme', next);
  }

  return (
    <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle color theme">
      <span className="theme-toggle-thumb" />
      {theme === 'light' ? 'Light' : 'Dark'}
    </button>
  );
}
