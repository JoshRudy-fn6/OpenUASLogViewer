/**
 * GPS Timestamp Extractor for ArduPilot flight logs
 * Supports both .bin and .tlog formats
 */

class GPSTimestampExtractor {
    constructor() {
        this.gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
    }

    /**
     * Extract GPS timestamps from a flight log buffer
     * @param {Buffer} buffer - The log file buffer
     * @param {string} fileType - 'bin' or 'tlog'
     * @returns {Object} GPS timestamp data
     */
    extractTimestamps(buffer, fileType = 'bin') {
        if (fileType === 'bin') {
            return this.extractFromBin(buffer)
        } else if (fileType === 'tlog') {
            return this.extractFromTlog(buffer)
        } else {
            throw new Error(`Unsupported file type: ${fileType}`)
        }
    }

    /**
     * Extract GPS timestamps from ArduPilot .bin files
     */
    extractFromBin(buffer) {
        const result = {
            gpsTimestamps: [],
            relativeTimestamps: [],
            messageTypes: new Map(),
            hasGPSLock: false,
            flightDuration: 0,
            startTime: null,
            timeRange: null
        }

        let offset = 0
        const maxScanMessages = 10000 // Limit for performance

        // First pass: Find format definitions
        while (offset < buffer.length - 10) {
            if (buffer[offset] === 0xA3 && buffer[offset + 1] === 0x95) {
                const msgType = buffer[offset + 2]
                const length = buffer[offset + 3]

                if (length > 200 || length < 4) {
                    offset++
                    continue
                }

                try {
                    // Parse format messages (type 0x80)
                    if (msgType === 0x80) {
                        // Read the format message structure:
                        // msgtype(1), length(1), type(1), length_again(1), name(4), format(16), labels(64)
                        const formatMsgType = buffer[offset + 4] // The message type this format defines
                        const formatLength = buffer[offset + 5]
                        const name = buffer.slice(offset + 6, offset + 10)
                            .toString('ascii').replace(/\0/g, '').trim()
                        const format = buffer.slice(offset + 10, offset + 26)
                            .toString('ascii').replace(/\0/g, '').trim()
                        const labels = buffer.slice(offset + 26, offset + 90)
                            .toString('ascii').replace(/\0/g, '').trim()
                        
                        if (name && format && labels) {
                            const formatDef = {
                                type: formatMsgType,
                                name,
                                format,
                                labels: labels.split(',').map(l => l.trim()).filter(l => l.length > 0)
                            }

                            // Store the message type definition using the defined type
                            result.messageTypes.set(formatMsgType, formatDef)
                        }
                    }

                    offset += length
                } catch (error) {
                    offset++
                }
            } else {
                offset++
            }
        }

        // Second pass: Extract timestamp data from known message types
        offset = 0
        let messageCount = 0

        while (offset < buffer.length - 10 && messageCount < maxScanMessages) {
            if (buffer[offset] === 0xA3 && buffer[offset + 1] === 0x95) {
                const msgType = buffer[offset + 2]
                const length = buffer[offset + 3]

                if (length > 200 || length < 4) {
                    offset++
                    continue
                }

                const formatDef = result.messageTypes.get(msgType)
                if (formatDef && msgType !== 0x80) {
                    // Only process messages with timestamp or GPS data
                    const hasTimeData = formatDef.labels.some(label => 
                        label === 'imeUS' || label === 'TimeUS' || 
                        label === 'GWk' || label === 'GMS' || 
                        label === 'Week' || label === 'WkMS'
                    )
                    
                    if (hasTimeData) {
                        try {
                            const timestampData = this.parseTimestampMessage(buffer, offset + 4, formatDef)
                            if (timestampData) {
                                if (timestampData.TimeUS) {
                                    result.relativeTimestamps.push({
                                        timeUS: Number(timestampData.TimeUS),
                                        seconds: Number(timestampData.TimeUS) / 1000000,
                                        messageType: formatDef.name
                                    })
                                }

                                if (timestampData.GWk !== undefined && timestampData.GMS !== undefined) {
                                    const absoluteTime = this.convertGPSToUTC(timestampData.GWk, timestampData.GMS)
                                    if (absoluteTime) {
                                        result.gpsTimestamps.push({
                                            gpsWeek: timestampData.GWk,
                                            gpsMS: timestampData.GMS,
                                            utcTime: absoluteTime,
                                            timeUS: timestampData.TimeUS ? Number(timestampData.TimeUS) : null,
                                            messageType: formatDef.name
                                        })
                                        result.hasGPSLock = true
                                    }
                                }
                            }
                            messageCount++
                        } catch (error) {
                            // Skip invalid messages
                        }
                    }
                }

                offset += length
            } else {
                offset++
            }
        }

        // Calculate flight duration and time range
        if (result.relativeTimestamps.length > 0) {
            const sorted = result.relativeTimestamps.sort((a, b) => a.timeUS - b.timeUS)
            result.flightDuration = (sorted[sorted.length - 1].timeUS - sorted[0].timeUS) / 1000000
        }

        if (result.gpsTimestamps.length > 0) {
            const sorted = result.gpsTimestamps.sort((a, b) => a.utcTime.getTime() - b.utcTime.getTime())
            result.startTime = sorted[0].utcTime
            result.timeRange = {
                start: sorted[0].utcTime,
                end: sorted[sorted.length - 1].utcTime
            }
        }

        return result
    }

    /**
     * Parse timestamp data from a message
     */
    parseTimestampMessage(buffer, dataOffset, formatDef) {
        const data = {}
        let offset = dataOffset

        try {
            for (let i = 0; i < formatDef.format.length && i < formatDef.labels.length; i++) {
                const formatChar = formatDef.format[i]
                const label = formatDef.labels[i]

                if (offset >= buffer.length) break

                // Fix truncated TimeUS label
                const actualLabel = label === 'imeUS' ? 'TimeUS' : label

                switch (formatChar) {
                    case 'Q': // uint64 - TimeUS
                        if (actualLabel === 'TimeUS' && offset + 8 <= buffer.length) {
                            data[actualLabel] = buffer.readBigUInt64LE(offset)
                        }
                        offset += 8
                        break
                    case 'H': // uint16 - GPS Week
                        if (actualLabel === 'GWk' && offset + 2 <= buffer.length) {
                            data[actualLabel] = buffer.readUInt16LE(offset)
                        } else if (actualLabel === 'Week' && offset + 2 <= buffer.length) {
                            data['GWk'] = buffer.readUInt16LE(offset) // Normalize Week to GWk
                        }
                        offset += 2
                        break
                    case 'I': // uint32 - GPS Milliseconds or WkMS
                        if (actualLabel === 'GMS' && offset + 4 <= buffer.length) {
                            data[actualLabel] = buffer.readUInt32LE(offset)
                        } else if (actualLabel === 'WkMS' && offset + 4 <= buffer.length) {
                            data['GMS'] = buffer.readUInt32LE(offset) // Normalize WkMS to GMS
                        }
                        offset += 4
                        break
                    case 'B': offset += 1; break
                    case 'L': case 'e': case 'f': case 'c': offset += 4; break
                    case 'h': offset += 2; break
                    case 'n': offset += 4; break
                    case 'N': offset += 16; break
                    case 'Z': offset += 64; break
                    default: offset += 1
                }
            }
        } catch (error) {
            return null
        }

        return (data.TimeUS || data.GWk !== undefined || data.GMS !== undefined) ? data : null
    }

    /**
     * Extract GPS timestamps from .tlog files (MAVLink format)
     */
    extractFromTlog(buffer) {
        // TODO: Implement MAVLink parsing for .tlog files
        // This would parse MAVLink GPS_RAW_INT and SYSTEM_TIME messages
        return {
            gpsTimestamps: [],
            relativeTimestamps: [],
            messageTypes: new Map(),
            hasGPSLock: false,
            flightDuration: 0,
            startTime: null,
            timeRange: null
        }
    }

    /**
     * Convert GPS Week/Milliseconds to UTC time
     */
    convertGPSToUTC(gpsWeek, gpsMS) {
        // Validate GPS week (should be reasonable - current GPS week is ~2300-2400)
        if (gpsWeek < 1000 || gpsWeek > 4000) {
            return null
        }

        // Validate GPS milliseconds (should be within a week)
        if (gpsMS < 0 || gpsMS >= 7 * 24 * 60 * 60 * 1000) {
            return null
        }

        try {
            const gpsTime = this.gpsEpoch + (gpsWeek * 7 * 24 * 60 * 60 * 1000) + gpsMS
            return new Date(gpsTime)
        } catch (error) {
            return null
        }
    }

    /**
     * Get GPS time at a specific relative timestamp (TimeUS)
     */
    getGPSTimeAtRelativeTime(timestampData, relativeTimeUS) {
        if (!timestampData.hasGPSLock || timestampData.gpsTimestamps.length === 0) {
            return null
        }

        // Find GPS timestamp closest to the relative time
        let closestGPS = null
        let closestTimeDiff = Infinity

        for (const gpsTimestamp of timestampData.gpsTimestamps) {
            if (gpsTimestamp.timeUS) {
                const timeDiff = Math.abs(gpsTimestamp.timeUS - relativeTimeUS)
                if (timeDiff < closestTimeDiff) {
                    closestTimeDiff = timeDiff
                    closestGPS = gpsTimestamp
                }
            }
        }

        if (closestGPS && closestTimeDiff < 5000000) { // Within 5 seconds
            // Interpolate the exact time
            const timeDiffSeconds = (relativeTimeUS - closestGPS.timeUS) / 1000000
            const interpolatedTime = new Date(closestGPS.utcTime.getTime() + (timeDiffSeconds * 1000))
            return interpolatedTime
        }

        return null
    }

    /**
     * Format time for display
     */
    formatTimeForDisplay(date, showMilliseconds = false) {
        if (!date || !(date instanceof Date)) {
            return null
        }

        const options = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'UTC'
        }

        let formatted = date.toLocaleString('en-US', options) + ' UTC'
        
        if (showMilliseconds) {
            const ms = date.getMilliseconds().toString().padStart(3, '0')
            formatted = formatted.replace(' UTC', `.${ms} UTC`)
        }

        return formatted
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GPSTimestampExtractor
} else if (typeof window !== 'undefined') {
    window.GPSTimestampExtractor = GPSTimestampExtractor
}
