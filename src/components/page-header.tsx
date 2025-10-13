'use client';

import { motion } from 'framer-motion';
import SignInButton from './sign-in-button';

interface PageHeaderProps {
    session: any;
}

export default function PageHeader({ session }: PageHeaderProps) {
    const startDate = new Date('2025-10-06');
    const endDate = new Date('2025-10-31');
    const today = new Date();
    const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysElapsed = Math.max(
        0,
        Math.ceil(
            (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
        )
    );
    const daysRemaining = Math.max(0, totalDays - daysElapsed);
    const progressPercentage = Math.min(
        100,
        Math.max(0, (daysElapsed / totalDays) * 100)
    );

    return (
        <motion.header
            className="page-header-compact"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div className="header-bg-blur"></div>

            <div className="header-compact-content">
                <div className="header-left">
                    <motion.div
                        className="compact-badge"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{
                            delay: 0.2,
                            type: 'spring',
                            stiffness: 200,
                        }}
                    >
                        <span className="badge-icon">🏃</span>
                        <span className="badge-label">#GetFitOctober</span>
                    </motion.div>

                    <motion.h1
                        className="header-compact-title"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        October Fitness Challenge
                    </motion.h1>
                </div>

                <motion.div
                    className="header-right"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <div className="compact-stats">
                        <div className="stat-compact">
                            <span className="stat-compact-icon">⏰</span>
                            <span className="stat-compact-value">
                                {daysRemaining}d left
                            </span>
                        </div>
                        <div className="stat-compact">
                            <span className="stat-compact-icon">📊</span>
                            <span className="stat-compact-value">
                                {Math.round(progressPercentage)}%
                            </span>
                        </div>
                    </div>

                    {session?.user ? (
                        <div className="user-compact">
                            {session.user.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={session.user.image}
                                    alt={session.user.name || 'User'}
                                    className="user-compact-avatar"
                                    referrerPolicy="no-referrer"
                                />
                            )}
                            <SignInButton
                                variant="signout"
                                name={session.user.name}
                            />
                        </div>
                    ) : (
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <SignInButton />
                        </motion.div>
                    )}
                </motion.div>
            </div>

            <motion.div
                className="progress-bar-slim"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
            >
                <motion.div
                    className="progress-bar-slim-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercentage}%` }}
                    transition={{ delay: 0.7, duration: 1.2, ease: 'easeOut' }}
                />
            </motion.div>
        </motion.header>
    );
}
