/**
 * Centralized time formatting utilities for consistent timestamp display
 * Ensures deterministic formatting to avoid rounding discrepancies between users
 */

/**
 * Format boot time milliseconds to HH:MM:SS.t format
 * Uses integer arithmetic to avoid floating point precision issues
 * @param {number} milliseconds - Time in milliseconds since boot
 * @returns {string} Formatted time string (HH:MM:SS.t)
 */
export function formatBootTime(milliseconds) {
    // Ensure we're working with an integer to avoid floating point precision issues
    const totalMs = Math.floor(milliseconds)
    
    // Calculate components using integer arithmetic
    const totalSeconds = Math.floor(totalMs / 1000)
    const ms = totalMs % 1000
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3600)
    
    // Format consistently: HH:MM:SS.t (showing tenths for compatibility)
    // Using integer arithmetic to avoid floating point rounding issues
    const tenths = Math.floor(ms / 100)
    const secondsStr = seconds.toString().padStart(2, '0') + '.' + tenths
    const minutesStr = minutes.toString().padStart(2, '0')
    const hoursStr = hours.toString().padStart(2, '0')
    
    return `${hoursStr}:${minutesStr}:${secondsStr}`
}

/**
 * Format boot time milliseconds to MM:SS format (no hours, no decimals)
 * @param {number} milliseconds - Time in milliseconds since boot
 * @returns {string} Formatted time string (MM:SS)
 */
export function formatBootTimeSimple(milliseconds) {
    const totalMs = Math.floor(milliseconds)
    const totalSeconds = Math.floor(totalMs / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60)
    
    const secondsStr = seconds.toString().padStart(2, '0')
    const minutesStr = minutes.toString().padStart(2, '0')
    
    return `${minutesStr}:${secondsStr}`
}

/**
 * Format boot time milliseconds to HH:MM:SS format (no decimals, with hours)
 * @param {number} milliseconds - Time in milliseconds since boot
 * @returns {string} Formatted time string (HH:MM:SS)
 */
export function formatBootTimeWithHours(milliseconds) {
    const totalMs = Math.floor(milliseconds)
    const totalSeconds = Math.floor(totalMs / 1000)
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3600)
    
    const secondsStr = seconds.toString().padStart(2, '0')
    const minutesStr = minutes.toString().padStart(2, '0')
    const hoursStr = hours.toString().padStart(2, '0')
    
    return `${hoursStr}:${minutesStr}:${secondsStr}`
}

/**
 * Format boot time milliseconds to HH:MM:SS.sss format (with milliseconds)
 * @param {number} milliseconds - Time in milliseconds since boot
 * @returns {string} Formatted time string (HH:MM:SS.sss)
 */
export function formatBootTimeWithMillis(milliseconds) {
    const totalMs = Math.floor(milliseconds)
    const totalSeconds = Math.floor(totalMs / 1000)
    const ms = totalMs % 1000
    const seconds = totalSeconds % 60
    const minutes = Math.floor(totalSeconds / 60) % 60
    const hours = Math.floor(totalSeconds / 3600)
    
    const msStr = ms.toString().padStart(3, '0')
    const secondsStr = seconds.toString().padStart(2, '0')
    const minutesStr = minutes.toString().padStart(2, '0')
    const hoursStr = hours.toString().padStart(2, '0')
    
    return `${hoursStr}:${minutesStr}:${secondsStr}.${msStr}`
}

/**
 * Format relative time (from start) to appropriate format based on duration
 * Automatically shows hours if duration exceeds 60 minutes
 * @param {number} timeMs - Current time in milliseconds
 * @param {number} startTimeMs - Start time in milliseconds
 * @returns {string} Formatted relative time string
 */
export function formatRelativeTime(timeMs, startTimeMs = 0) {
    const relativeMs = Math.floor(timeMs - startTimeMs)
    const totalSeconds = Math.floor(relativeMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    
    // For longer flights, show hours too
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60)
        const remainingMinutes = minutes % 60
        return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    } else {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }
}

/**
 * Parse a time string (HH:MM:SS or MM:SS) back to milliseconds
 * @param {string} timeStr - Time string to parse
 * @returns {number} Time in milliseconds
 */
export function parseTimeString(timeStr) {
    const parts = timeStr.split(':')
    let hours = 0, minutes = 0, seconds = 0
    
    if (parts.length === 3) {
        // HH:MM:SS
        hours = parseInt(parts[0], 10)
        minutes = parseInt(parts[1], 10)
        seconds = parseFloat(parts[2])
    } else if (parts.length === 2) {
        // MM:SS
        minutes = parseInt(parts[0], 10)
        seconds = parseFloat(parts[1])
    }
    
    return Math.floor((hours * 3600 + minutes * 60 + seconds) * 1000)
}

export default {
    formatBootTime,
    formatBootTimeSimple,
    formatBootTimeWithHours,
    formatBootTimeWithMillis,
    formatRelativeTime,
    parseTimeString
}
