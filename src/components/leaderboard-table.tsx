'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DailyStepBreakdown } from '@/lib/google-fit';
import SignInButton from './sign-in-button';

type LeaderboardRow = {
    participantId: string;
    name: string;
    email: string;
    photo?: string;
    totalSteps: number;
    lastSyncedAt: string | null;
    isRefreshing: boolean;
    syncStatus: string;
    tokenExpired?: boolean;
};

type LeaderboardTableProps = {
    rows: LeaderboardRow[];
    podiumEmojis: string[];
    podiumTitles: string[];
};

type FetchState = {
    loading: boolean;
    error?: string | null;
    data: DailyStepBreakdown[];
};

const DAILY_LABEL_FORMATTER = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
});

const LAST_SYNCED_FORMATTER = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
});

function formatDateLabel(startTimeMillis: number) {
    return DAILY_LABEL_FORMATTER.format(new Date(startTimeMillis));
}

function formatLastSynced(value: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return LAST_SYNCED_FORMATTER.format(date);
}

export default function LeaderboardTable({
    rows,
    podiumEmojis,
    podiumTitles,
}: LeaderboardTableProps) {
    const [selected, setSelected] = useState<LeaderboardRow | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [fetchState, setFetchState] = useState<FetchState>({
        loading: false,
        error: null,
        data: [],
    });
    const abortControllerRef = useRef<AbortController | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
        };
    }, []);

    const closeModal = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setIsModalOpen(false);
        setSelected(null);
        setFetchState({ loading: false, error: null, data: [] });
    }, []);

    const handleRowInteraction = useCallback((row: LeaderboardRow) => {
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setSelected(row);
        setIsModalOpen(true);
        setFetchState({ loading: true, error: null, data: [] });

        void fetch(`/api/participants/${row.participantId}/daily`, {
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) {
                    const payload = await response.json().catch(() => null);
                    const message =
                        payload?.error ??
                        `Failed to load daily steps (status ${response.status})`;
                    throw new Error(message);
                }

                return response.json() as Promise<{
                    dailySteps: DailyStepBreakdown[];
                }>;
            })
            .then((payload) => {
                if (controller.signal.aborted) {
                    return;
                }
                const dailySteps = (
                    Array.isArray(payload.dailySteps) ? payload.dailySteps : []
                ).filter(
                    (day) => typeof day?.steps === 'number' && day.steps > 0
                );
                setFetchState({
                    loading: false,
                    error: null,
                    data: dailySteps,
                });
            })
            .catch((error) => {
                if (
                    error instanceof DOMException &&
                    error.name === 'AbortError'
                ) {
                    return;
                }

                setFetchState({
                    loading: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Failed to load daily steps',
                    data: [],
                });
            });
    }, []);

    useEffect(() => {
        if (!isModalOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isModalOpen, closeModal]);

    useEffect(() => {
        if (!isModalOpen) {
            return;
        }

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isModalOpen]);

    useEffect(() => {
        if (isModalOpen) {
            closeButtonRef.current?.focus();
        }
    }, [isModalOpen]);

    const totalFromDaily = useMemo(() => {
        return fetchState.data.reduce((sum, day) => sum + day.steps, 0);
    }, [fetchState.data]);

    const lastSyncedLabel = selected
        ? formatLastSynced(selected.lastSyncedAt)
        : null;
    const modalTitleId = selected
        ? `leaderboard-breakdown-title-${selected.participantId}`
        : undefined;

    return (
        <>
            <table className="leaderboard" role="grid">
                <thead>
                    <tr>
                        <th scope="col">Rank</th>
                        <th scope="col">Name</th>
                        <th scope="col" className="right-align">
                            Steps
                        </th>
                        <th
                            scope="col"
                            className="right-align steps-needed-header"
                        >
                            To Next Rank
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((entry, index) => {
                        const isPodium = index < 10;
                        const isSelected =
                            isModalOpen &&
                            selected?.participantId === entry.participantId;

                        // Calculate steps needed to reach next position
                        const stepsToNextRank =
                            index > 0
                                ? rows[index - 1].totalSteps -
                                  entry.totalSteps +
                                  1
                                : null;

                        const rowClassNames = [
                            'leaderboard-row',
                            isPodium
                                ? `leaderboard-row--podium leaderboard-row--podium-${
                                      index + 1
                                  }`
                                : '',
                            'leaderboard-row--interactive',
                            isSelected ? 'leaderboard-row--selected' : '',
                        ]
                            .filter(Boolean)
                            .join(' ');

                        return (
                            <tr
                                key={entry.participantId}
                                className={rowClassNames}
                                tabIndex={0}
                                role="button"
                                aria-pressed={isSelected}
                                onClick={() => handleRowInteraction(entry)}
                                onKeyDown={(event) => {
                                    if (
                                        event.key === 'Enter' ||
                                        event.key === ' '
                                    ) {
                                        event.preventDefault();
                                        handleRowInteraction(entry);
                                    }
                                }}
                            >
                                <td className="rank">
                                    <span className="rank-number">
                                        {index + 1}
                                    </span>
                                    {isPodium ? (
                                        <span
                                            className={`rank-emoji rank-emoji--${
                                                index + 1
                                            }`}
                                            aria-hidden="true"
                                            role="img"
                                        >
                                            {podiumEmojis[index]}
                                        </span>
                                    ) : null}
                                </td>
                                <td>
                                    <div className="participant">
                                        {entry.photo ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={entry.photo}
                                                alt={entry.name}
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : null}
                                        <div>
                                            <p className="participant-name">
                                                {entry.name}
                                            </p>
                                            {isPodium ? (
                                                <p
                                                    className={`podium-label podium-label--${
                                                        index + 1
                                                    }`}
                                                >
                                                    {podiumTitles[index]}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                </td>
                                <td className="steps">
                                    <div className="steps-container">
                                        <div className="steps-value">
                                            {entry.totalSteps.toLocaleString()}
                                            {entry.tokenExpired && (
                                                <span
                                                    className="token-expired-icon"
                                                    title="Token expired. Please log in again to fetch the latest data."
                                                    aria-label="Token expired"
                                                >
                                                    ⚠️
                                                </span>
                                            )}
                                        </div>
                                        {stepsToNextRank !== null && (
                                            <div
                                                className={`steps-needed-mobile ${
                                                    stepsToNextRank <= 1000
                                                        ? 'steps-needed-badge--close'
                                                        : ''
                                                }`}
                                            >
                                                <svg
                                                    width="12"
                                                    height="12"
                                                    viewBox="0 0 12 12"
                                                    fill="none"
                                                    className="arrow-icon"
                                                    aria-hidden="true"
                                                >
                                                    <path
                                                        d="M6 10V2M6 2L2 6M6 2L10 6"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />
                                                </svg>
                                                <span>
                                                    +
                                                    {stepsToNextRank.toLocaleString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    {entry.syncStatus === 'error' && (
                                        <div
                                            className={[
                                                'sync-pill',
                                                entry.isRefreshing
                                                    ? 'sync-pill--refreshing'
                                                    : '',
                                                entry.syncStatus === 'error'
                                                    ? 'sync-pill--error'
                                                    : '',
                                            ]
                                                .filter(Boolean)
                                                .join(' ')}
                                        >
                                            <span
                                                className="sync-pill__dot"
                                                aria-hidden="true"
                                            />
                                            {entry.isRefreshing
                                                ? 'Refreshing...'
                                                : 'Sync failed'}
                                        </div>
                                    )}
                                </td>
                                <td className="steps-needed-desktop">
                                    {stepsToNextRank !== null ? (
                                        <div
                                            className={`steps-needed-badge ${
                                                stepsToNextRank <= 1000
                                                    ? 'steps-needed-badge--close'
                                                    : ''
                                            }`}
                                        >
                                            <svg
                                                width="14"
                                                height="14"
                                                viewBox="0 0 12 12"
                                                fill="none"
                                                className="arrow-icon"
                                                aria-hidden="true"
                                            >
                                                <path
                                                    d="M6 10V2M6 2L2 6M6 2L10 6"
                                                    stroke="currentColor"
                                                    strokeWidth="1.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </svg>
                                            <span className="steps-needed-value">
                                                {stepsToNextRank.toLocaleString()}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="steps-needed-leader">
                                            🏆 Leader
                                        </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {isModalOpen && selected ? (
                <div
                    className="leaderboard-modal-overlay"
                    role="presentation"
                    onClick={closeModal}
                >
                    <section
                        className="leaderboard-breakdown"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={modalTitleId}
                        aria-describedby="leaderboard-breakdown-body"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="leaderboard-breakdown__close"
                            onClick={closeModal}
                            ref={closeButtonRef}
                            aria-label="Close daily steps"
                        >
                            ×
                        </button>
                        <header className="leaderboard-breakdown__header">
                            <div>
                                <h3
                                    id={modalTitleId}
                                    className="leaderboard-breakdown__title"
                                >
                                    {selected.name}
                                </h3>
                                {lastSyncedLabel ? (
                                    <p className="leaderboard-breakdown__meta">
                                        Last synced {lastSyncedLabel}
                                    </p>
                                ) : null}
                            </div>
                            <div className="leaderboard-breakdown__total">
                                <span>Total steps</span>
                                <strong>
                                    {selected.totalSteps.toLocaleString()}
                                </strong>
                            </div>
                        </header>

                        <div
                            id="leaderboard-breakdown-body"
                            className="leaderboard-breakdown__body"
                        >
                            {/* Re-login banner - Show for error status or stale data */}
                            {(selected.syncStatus === 'error' ||
                                selected.syncStatus === 'stale' ||
                                !selected.lastSyncedAt) && (
                                <div
                                    style={{
                                        backgroundColor:
                                            selected.syncStatus === 'error'
                                                ? '#fee2e2'
                                                : '#fef3c7',
                                        border:
                                            selected.syncStatus === 'error'
                                                ? '1px solid #f87171'
                                                : '1px solid #fbbf24',
                                        borderRadius: '8px',
                                        padding: '12px 16px',
                                        marginBottom: '16px',
                                        display: 'flex',
                                        alignItems: 'start',
                                        gap: '12px',
                                    }}
                                >
                                    <svg
                                        width="20"
                                        height="20"
                                        viewBox="0 0 20 20"
                                        fill="none"
                                        style={{
                                            flexShrink: 0,
                                            marginTop: '2px',
                                        }}
                                    >
                                        {selected.syncStatus === 'error' ? (
                                            <>
                                                <path
                                                    d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                                                    stroke="#dc2626"
                                                    strokeWidth="1.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                                <path
                                                    d="M10 6V10"
                                                    stroke="#dc2626"
                                                    strokeWidth="1.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                                <path
                                                    d="M10 14H10.01"
                                                    stroke="#dc2626"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <path
                                                    d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
                                                    stroke="#d97706"
                                                    strokeWidth="1.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                                <path
                                                    d="M10 6V10"
                                                    stroke="#d97706"
                                                    strokeWidth="1.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                                <path
                                                    d="M10 14H10.01"
                                                    stroke="#d97706"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                            </>
                                        )}
                                    </svg>
                                    <div style={{ flex: 1 }}>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontSize: '14px',
                                                color:
                                                    selected.syncStatus ===
                                                    'error'
                                                        ? '#991b1b'
                                                        : '#92400e',
                                                fontWeight: '500',
                                                marginBottom: '4px',
                                            }}
                                        >
                                            {selected.syncStatus === 'error'
                                                ? '⚠️ Sync Failed'
                                                : '🔄 Score Not Updating?'}
                                        </p>
                                        <p
                                            style={{
                                                margin: 0,
                                                fontSize: '13px',
                                                color:
                                                    selected.syncStatus ===
                                                    'error'
                                                        ? '#7f1d1d'
                                                        : '#78350f',
                                                lineHeight: '1.5',
                                                marginBottom: '12px',
                                            }}
                                        >
                                            {selected.syncStatus === 'error'
                                                ? 'Your Google Fit connection has expired. '
                                                : 'If your steps aren\u2019t syncing, '}
                                            Click the{' '}
                                            <strong>
                                                &ldquo;Join Now&rdquo; button
                                                below
                                            </strong>{' '}
                                            to sign in and refresh your Google
                                            Fit connection.
                                        </p>
                                        <SignInButton variant="signin" />
                                    </div>
                                </div>
                            )}

                            {/* General info banner for all users */}
                            {selected.syncStatus !== 'error' &&
                                selected.syncStatus !== 'stale' &&
                                selected.lastSyncedAt && (
                                    <div
                                        style={{
                                            backgroundColor: '#eff6ff',
                                            border: '1px solid #93c5fd',
                                            borderRadius: '8px',
                                            padding: '10px 16px',
                                            marginBottom: '16px',
                                            fontSize: '13px',
                                            color: '#1e3a8a',
                                            lineHeight: '1.5',
                                        }}
                                    >
                                        💡 <strong>Tip:</strong> If your score
                                        stops updating, click the sign-in button
                                        to refresh your Google Fit connection.
                                    </div>
                                )}

                            {fetchState.loading ? (
                                <p className="leaderboard-breakdown__status">
                                    Loading daily steps…
                                </p>
                            ) : fetchState.error ? (
                                <p className="leaderboard-breakdown__status leaderboard-breakdown__status--error">
                                    {fetchState.error}
                                </p>
                            ) : fetchState.data.length === 0 ? (
                                <p className="leaderboard-breakdown__status">
                                    No daily data returned for this participant
                                    yet.
                                </p>
                            ) : (
                                <>
                                    <p className="leaderboard-breakdown__status leaderboard-breakdown__status--summary">
                                        Daily totals sum to{' '}
                                        <strong>
                                            {totalFromDaily.toLocaleString()}
                                        </strong>{' '}
                                        steps across the challenge window.
                                    </p>
                                    <ol className="leaderboard-breakdown__list">
                                        {fetchState.data.map((day) => (
                                            <li
                                                key={day.startTimeMillis}
                                                className="leaderboard-breakdown__item"
                                            >
                                                <span className="leaderboard-breakdown__date">
                                                    {formatDateLabel(
                                                        day.startTimeMillis
                                                    )}
                                                </span>
                                                <span className="leaderboard-breakdown__steps">
                                                    {day.steps.toLocaleString()}
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            )}
                        </div>
                    </section>
                </div>
            ) : null}
        </>
    );
}
