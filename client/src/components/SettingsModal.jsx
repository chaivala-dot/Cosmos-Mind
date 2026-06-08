import React from 'react';
import { X, Sun, Moon, Palette, Type } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const SettingsModal = ({ isOpen, onClose }) => {
    const { mode, toggleMode, accentColor, setAccentColor, accentColors, fontSize, setFontSize } = useTheme();

    if (!isOpen) return null;

    const fontSizeOptions = [
        { value: 'small', label: 'Small', size: '14px' },
        { value: 'medium', label: 'Medium', size: '16px' },
        { value: 'large', label: 'Large', size: '18px' },
        { value: 'xlarge', label: 'X-Large', size: '20px' },
    ];

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-theme-bg border border-theme-border rounded-2xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-light text-theme-text">Customization</h2>
                    <button
                        onClick={onClose}
                        className="text-theme-text-muted hover:text-theme-text transition-colors"
                    >
                        <X size={24} strokeWidth={1.5} />
                    </button>
                </div>

                {/* Theme Mode */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        {mode === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                        <h3 className="text-lg font-medium text-theme-text">Theme Mode</h3>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => toggleMode()}
                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${mode === 'dark'
                                    ? 'border-accent bg-accent/10 text-theme-text'
                                    : 'border-theme-border text-theme-text-muted hover:border-theme-border-hover'
                                }`}
                        >
                            <Moon size={24} className="mx-auto mb-2" />
                            <div className="text-sm font-medium">Dark</div>
                        </button>
                        <button
                            onClick={() => toggleMode()}
                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${mode === 'light'
                                    ? 'border-accent bg-accent/10 text-theme-text'
                                    : 'border-theme-border text-theme-text-muted hover:border-theme-border-hover'
                                }`}
                        >
                            <Sun size={24} className="mx-auto mb-2" />
                            <div className="text-sm font-medium">Light</div>
                        </button>
                    </div>
                </div>

                {/* Accent Color */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Palette size={18} />
                        <h3 className="text-lg font-medium text-theme-text">Accent Color</h3>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {Object.entries(accentColors).map(([name, colors]) => (
                            <button
                                key={name}
                                onClick={() => setAccentColor(name)}
                                className={`p-3 rounded-xl border-2 transition-all hover:scale-105 ${accentColor === name
                                        ? 'border-theme-text scale-105'
                                        : 'border-theme-border'
                                    }`}
                                title={name}
                            >
                                <div
                                    className="w-full h-12 rounded-lg"
                                    style={{ backgroundColor: colors.primary }}
                                />
                                <div className="text-xs mt-2 capitalize text-theme-text-muted">{name}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Font Size */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Type size={18} />
                        <h3 className="text-lg font-medium text-theme-text">Font Size</h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {fontSizeOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => setFontSize(option.value)}
                                className={`p-4 rounded-xl border-2 transition-all ${fontSize === option.value
                                        ? 'border-accent bg-accent/10 text-theme-text'
                                        : 'border-theme-border text-theme-text-muted hover:border-theme-border-hover'
                                    }`}
                            >
                                <div style={{ fontSize: option.size }} className="font-medium mb-1">Aa</div>
                                <div className="text-xs">{option.label}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Preview */}
                <div className="p-6 rounded-xl bg-theme-surface border border-theme-border">
                    <h4 className="text-sm font-semibold text-theme-text-muted uppercase tracking-wide mb-3">Preview</h4>
                    <div className="space-y-2">
                        <p className="text-theme-text">This is how your text will look</p>
                        <p className="text-theme-text-muted text-sm">Secondary text appears like this</p>
                        <div className="flex gap-2 mt-4">
                            <span className="px-3 py-1 bg-accent/20 text-accent rounded-full text-sm">#tag-example</span>
                            <span className="px-3 py-1 bg-theme-border text-theme-text rounded-full text-sm">Stack</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
