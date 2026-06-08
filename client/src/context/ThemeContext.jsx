import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    // Load from localStorage or use defaults
    const [mode, setMode] = useState(() => localStorage.getItem('theme-mode') || 'dark');
    const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accent-color') || 'purple');
    const [fontSize, setFontSize] = useState(() => localStorage.getItem('font-size') || 'medium');

    // Accent color options - memoized to prevent recreating on every render
    const accentColors = useMemo(() => ({
        purple: { primary: '#a855f7', light: '#c084fc', dark: '#7e22ce' },
        blue: { primary: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
        green: { primary: '#10b981', light: '#34d399', dark: '#047857' },
        orange: { primary: '#f97316', light: '#fb923c', dark: '#c2410c' },
        pink: { primary: '#ec4899', light: '#f472b6', dark: '#be185d' },
        cyan: { primary: '#06b6d4', light: '#22d3ee', dark: '#0e7490' },
    }), []);

    // Font size multipliers - memoized to prevent recreating on every render
    const fontSizes = useMemo(() => ({
        small: 0.875,
        medium: 1,
        large: 1.125,
        xlarge: 1.25,
    }), []);

    // Save to localStorage whenever settings change
    useEffect(() => {
        localStorage.setItem('theme-mode', mode);
        localStorage.setItem('accent-color', accentColor);
        localStorage.setItem('font-size', fontSize);

        // Apply to document root
        document.documentElement.setAttribute('data-theme', mode);
        document.documentElement.setAttribute('data-accent', accentColor);
        document.documentElement.style.fontSize = `${fontSizes[fontSize]}rem`;

        // Apply accent color CSS variables
        const accent = accentColors[accentColor];
        document.documentElement.style.setProperty('--accent-primary', accent.primary);
        document.documentElement.style.setProperty('--accent-light', accent.light);
        document.documentElement.style.setProperty('--accent-dark', accent.dark);
    }, [mode, accentColor, fontSize, accentColors, fontSizes]);

    const value = {
        mode,
        setMode,
        accentColor,
        setAccentColor,
        accentColors,
        fontSize,
        setFontSize,
        fontSizes,
        toggleMode: () => setMode(prev => prev === 'dark' ? 'light' : 'dark'),
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
