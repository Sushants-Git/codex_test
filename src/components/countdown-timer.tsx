'use client';

import { useState, useEffect } from 'react';
import { CHALLENGE_END } from '@/lib/challenge';

interface CountdownTimerProps {
    className?: string;
}

interface TimeRemaining {
    hours: number;
    minutes: number;
    seconds: number;
    isExpired: boolean;
}

export default function CountdownTimer({ className = '' }: CountdownTimerProps) {
    const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>({
        hours: 0,
        minutes: 0,
        seconds: 0,
        isExpired: false,
    });

    useEffect(() => {
        const calculateTimeRemaining = (): TimeRemaining => {
            const now = new Date().getTime();
            const endTime = CHALLENGE_END.getTime();
            const difference = endTime - now;

            if (difference <= 0) {
                return {
                    hours: 0,
                    minutes: 0,
                    seconds: 0,
                    isExpired: true,
                };
            }

            const hours = Math.floor(difference / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);

            return {
                hours,
                minutes,
                seconds,
                isExpired: false,
            };
        };

        // Initial calculation
        setTimeRemaining(calculateTimeRemaining());

        // Update every second
        const interval = setInterval(() => {
            setTimeRemaining(calculateTimeRemaining());
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    if (timeRemaining.isExpired) {
        return (
            <span className={`countdown-timer ${className}`}>
                Challenge Ended
            </span>
        );
    }

    return (
        <span className={`countdown-timer ${className}`}>
            {timeRemaining.hours.toString().padStart(2, '0')}:
            {timeRemaining.minutes.toString().padStart(2, '0')}:
            {timeRemaining.seconds.toString().padStart(2, '0')}
        </span>
    );
}