import { useState, useEffect } from 'react';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Hook to determine if the current date is within the Christmas season.
 * Season defined as: December 1st to January 7th.
 * Also returns true if forceChristmas setting is enabled (debug).
 * @returns {boolean} True if it's Christmas season or forced, false otherwise.
 */
const useIsChristmas = () => {
    const [isChristmas, setIsChristmas] = useState(false);
    const { settings } = useSettingsStore();

    useEffect(() => {
        const checkChristmas = () => {
            // Check debug setting first
            if (settings?.forceChristmas) {
                setIsChristmas(true);
                return;
            }

            const today = new Date();
            const month = today.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
            const day = today.getDate();

            // December (11) from 1st to 31st
            // January (0) from 1st to 7th
            const isDecember = month === 11 && day >= 1;
            const isJanuary = month === 0 && day <= 7;

            setIsChristmas(isDecember || isJanuary);
        };

        checkChristmas();

        // Optional: Check periodically if the app stays open across midnight
        const interval = setInterval(checkChristmas, 60000 * 60); // Check every hour
        return () => clearInterval(interval);
    }, [settings?.forceChristmas]);

    return isChristmas;
};

export default useIsChristmas;
