'use client';

import { useState, useRef, useEffect } from 'react';
import type { FilterOption } from '@/lib/leaderboard-filters';
import { filterOptions } from '@/lib/leaderboard-filters';

type LeaderboardFilterDropdownProps = {
    selectedFilter: FilterOption;
    onFilterChange: (filter: FilterOption) => void;
    className?: string;
};

export default function LeaderboardFilterDropdown({
    selectedFilter,
    onFilterChange,
    className = '',
}: LeaderboardFilterDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const selectedOption =
        filterOptions.find((option) => option.value === selectedFilter) ||
        filterOptions[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (isOpen && event.key === 'Escape') {
                setIsOpen(false);
                buttonRef.current?.focus();
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const handleOptionSelect = (filter: FilterOption) => {
        onFilterChange(filter);
        setIsOpen(false);
        buttonRef.current?.focus();
    };

    return (
        <div
            ref={dropdownRef}
            className={`leaderboard-filter-dropdown ${className}`}
        >
            <button
                ref={buttonRef}
                type="button"
                className="filter-dropdown-button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-label="Filter leaderboard"
            >
                <div className="filter-dropdown-content">
                    <div className="filter-dropdown-icon">
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
                        </svg>
                    </div>
                    <div className="filter-dropdown-text">
                        <span className="filter-dropdown-label">
                            {selectedOption.label}
                        </span>
                        <span className="filter-dropdown-description">
                            {selectedOption.description}
                        </span>
                    </div>
                </div>
                <div className="filter-dropdown-arrow">
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        className={`arrow-icon ${
                            isOpen ? 'arrow-icon--rotated' : ''
                        }`}
                    >
                        <path
                            d="M3 4.5L6 7.5L9 4.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>
            </button>

            {isOpen && (
                <div className="filter-dropdown-menu" role="listbox">
                    {filterOptions.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className={`filter-dropdown-option ${
                                option.value === selectedFilter
                                    ? 'filter-dropdown-option--selected'
                                    : ''
                            }`}
                            role="option"
                            aria-selected={option.value === selectedFilter}
                            onClick={() => handleOptionSelect(option.value)}
                        >
                            <div className="filter-option-content">
                                <span className="filter-option-label">
                                    {option.label}
                                </span>
                                <span className="filter-option-description">
                                    {option.description}
                                </span>
                            </div>
                            {option.value === selectedFilter && (
                                <div className="filter-option-check">
                                    <svg
                                        width="16"
                                        height="16"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <polyline points="20,6 9,17 4,12" />
                                    </svg>
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
