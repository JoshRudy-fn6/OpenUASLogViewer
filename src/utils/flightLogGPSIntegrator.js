/**
 * Complete GPS Timeline Integration System
 * 
 * This system provides a repeatable method for extracting GPS timestamps from flight logs
 * and displaying them on the timeline. It handles both .bin and .tlog formats.
 */

// Import GPS extractor - handle both Node.js and browser environments
let GPSTimestampExtractor
if (typeof require !== 'undefined') {
    GPSTimestampExtractor = require('./gpsTimestampExtractor.js')
} else {
    GPSTimestampExtractor = window.GPSTimestampExtractor
}

class FlightLogGPSIntegrator {
    constructor() {
        this.extractor = new GPSTimestampExtractor()
        this.cachedGPSData = new Map() // Cache GPS data by file hash
    }

    /**
     * Process a flight log file and extract GPS timestamp data
     * @param {File|Buffer} logFile - The flight log file
     * @param {string} fileType - 'bin' or 'tlog'
     * @returns {Promise<Object>} GPS timestamp data
     */
    async processFlightLog(logFile, fileType = 'bin') {
        try {
            // Convert File to Buffer if needed
            let buffer
            if (typeof File !== 'undefined' && logFile instanceof File) {
                buffer = Buffer.from(await logFile.arrayBuffer())
            } else {
                buffer = logFile // Assume it's already a Buffer
            }

            // Generate cache key from file size and first few bytes
            const cacheKey = this.generateCacheKey(buffer)
            
            // Check cache first
            if (this.cachedGPSData.has(cacheKey)) {
                console.log('Using cached GPS data')
                return this.cachedGPSData.get(cacheKey)
            }

            console.log(`Processing ${fileType} file for GPS timestamps...`)
            
            // Extract GPS timestamp data
            const gpsData = this.extractor.extractTimestamps(buffer, fileType)
            
            // Convert to format expected by timeline
            const timelineData = this.convertToTimelineFormat(gpsData)
            
            // Cache the result
            this.cachedGPSData.set(cacheKey, timelineData)
            
            console.log('GPS extraction completed:', {
                hasGPSLock: timelineData.hasGPSLock,
                gpsMessageCount: timelineData.gpsMessages.length,
                relativeTimeCount: timelineData.relativeTimeMessages.length,
                flightDuration: timelineData.flightDuration
            })
            
            return timelineData
            
        } catch (error) {
            console.error('Error processing flight log for GPS:', error)
            return this.createEmptyGPSData()
        }
    }

    /**
     * Integrate GPS data into the mapViewer state for timeline access
     * @param {Object} mapViewer - The OpenLayers map viewer instance
     * @param {Object} gpsData - GPS data from processFlightLog
     */
    integrateWithTimeline(mapViewer, gpsData) {
        if (!mapViewer.state) {
            mapViewer.state = {}
        }
        if (!mapViewer.state.messages) {
            mapViewer.state.messages = {}
        }

        // Add GPS messages in the format expected by timeline
        if (gpsData.gpsMessages.length > 0) {
            mapViewer.state.messages.GPS = gpsData.gpsMessages
            mapViewer.state.messages['PSQ'] = gpsData.gpsMessages.filter(msg => msg.messageType === 'PSQ')
            mapViewer.state.messages['BREQ'] = gpsData.gpsMessages.filter(msg => msg.messageType === 'BREQ')
        }

        // Add relative time messages for fallback
        if (gpsData.relativeTimeMessages.length > 0) {
            mapViewer.state.messages['TimeUS'] = gpsData.relativeTimeMessages
        }

        // Store metadata for timeline
        mapViewer.state.gpsMetadata = {
            hasGPSLock: gpsData.hasGPSLock,
            flightDuration: gpsData.flightDuration,
            startTime: gpsData.startTime,
            timeRange: gpsData.timeRange,
            extractionMethod: 'FlightLogGPSIntegrator'
        }

        console.log('GPS data integrated into timeline state')
    }

    /**
     * Convert extracted GPS data to timeline-compatible format
     */
    convertToTimelineFormat(gpsData) {
        const timelineData = {
            hasGPSLock: gpsData.hasGPSLock,
            flightDuration: gpsData.flightDuration,
            startTime: gpsData.startTime,
            timeRange: gpsData.timeRange,
            gpsMessages: [],
            relativeTimeMessages: []
        }

        // Convert GPS timestamps to timeline message format
        for (const gpsTimestamp of gpsData.gpsTimestamps) {
            const message = {
                // ArduPilot format fields
                GWk: gpsTimestamp.gpsWeek,
                GMS: gpsTimestamp.gpsMS,
                
                // MAVLink compatible fields
                time_week: gpsTimestamp.gpsWeek,
                time_week_ms: gpsTimestamp.gpsMS,
                
                // Boot time for correlation
                time_boot_ms: gpsTimestamp.timeUS ? Number(gpsTimestamp.timeUS) / 1000 : null,
                TimeUS: gpsTimestamp.timeUS,
                
                // Metadata
                messageType: gpsTimestamp.messageType,
                utcTime: gpsTimestamp.utcTime,
                
                // Timeline lookup helpers
                timestamp: gpsTimestamp.timeUS ? Number(gpsTimestamp.timeUS) / 1000 : null
            }
            
            timelineData.gpsMessages.push(message)
        }

        // Convert relative timestamps to timeline format
        for (const relativeTimestamp of gpsData.relativeTimestamps) {
            const message = {
                TimeUS: relativeTimestamp.timeUS,
                time_boot_ms: relativeTimestamp.seconds * 1000,
                timestamp: relativeTimestamp.seconds * 1000,
                messageType: relativeTimestamp.messageType,
                relativeSeconds: relativeTimestamp.seconds
            }
            
            timelineData.relativeTimeMessages.push(message)
        }

        return timelineData
    }

    /**
     * Search for GPS week and millisecond values in flight log
     * @param {Buffer} buffer - Flight log buffer
     * @param {string} fileType - 'bin' or 'tlog'
     * @returns {Object} Search results with GPS time correlation
     */
    searchGPSTimestamps(buffer, fileType = 'bin') {
        const gpsData = this.extractor.extractTimestamps(buffer, fileType)
        
        return {
            found: gpsData.hasGPSLock,
            gpsWeeks: [...new Set(gpsData.gpsTimestamps.map(ts => ts.gpsWeek))],
            gpsMilliseconds: gpsData.gpsTimestamps.map(ts => ts.gpsMS),
            flightDuration: gpsData.flightDuration,
            messageTypes: [...new Set(gpsData.gpsTimestamps.map(ts => ts.messageType))],
            timeRange: gpsData.timeRange,
            sampleTimestamps: gpsData.gpsTimestamps.slice(0, 5).map(ts => ({
                week: ts.gpsWeek,
                ms: ts.gpsMS,
                utc: this.extractor.formatTimeForDisplay(ts.utcTime),
                relative: ts.timeUS ? (Number(ts.timeUS) / 1000000).toFixed(3) + 's' : null
            }))
        }
    }

    /**
     * Validate GPS timestamp correlation with filename
     * @param {string} filename - Flight log filename
     * @param {Object} gpsData - Extracted GPS data
     * @returns {Object} Correlation analysis
     */
    validateTimestampCorrelation(filename, gpsData) {
        const filenameMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2})-(\d{2})-(\d{2})/)
        
        if (!filenameMatch || !gpsData.timeRange) {
            return { 
                valid: false, 
                reason: 'No filename timestamp or GPS data available' 
            }
        }

        const [, year, month, day, hour, minute, second] = filenameMatch
        const expectedTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
        
        const timeDiff = Math.abs(gpsData.timeRange.start.getTime() - expectedTime.getTime()) / 1000 / 60
        
        return {
            valid: timeDiff < 120, // Within 2 hours is reasonable
            expectedTime: this.extractor.formatTimeForDisplay(expectedTime),
            actualTime: this.extractor.formatTimeForDisplay(gpsData.timeRange.start),
            differenceMinutes: timeDiff.toFixed(1),
            correlation: timeDiff < 10 ? 'excellent' : 
                        timeDiff < 60 ? 'good' : 
                        timeDiff < 120 ? 'acceptable' : 'poor'
        }
    }

    /**
     * Generate cache key for GPS data
     */
    generateCacheKey(buffer) {
        const size = buffer.length
        const firstBytes = buffer.slice(0, 64).toString('hex')
        return `${size}-${firstBytes}`
    }

    /**
     * Create empty GPS data structure
     */
    createEmptyGPSData() {
        return {
            hasGPSLock: false,
            flightDuration: 0,
            startTime: null,
            timeRange: null,
            gpsMessages: [],
            relativeTimeMessages: []
        }
    }

    /**
     * Clear GPS data cache
     */
    clearCache() {
        this.cachedGPSData.clear()
    }

    /**
     * Get repeatable method summary for documentation
     */
    getMethodSummary() {
        return {
            title: "Repeatable GPS Timestamp Extraction Method",
            steps: [
                "1. Load flight log file (.bin or .tlog)",
                "2. Use FlightLogGPSIntegrator.processFlightLog(file, type)",
                "3. Integrate results with timeline using integrateWithTimeline(mapViewer, gpsData)",
                "4. Timeline automatically displays GPS timestamps using existing getGPSTimeAtBootTime()",
                "5. Validate correlation using validateTimestampCorrelation(filename, gpsData)"
            ],
            supportedFormats: [
                "ArduPilot .bin files (PSQ, BREQ, RAWQ message types)",
                "MAVLink .tlog files (GPS_RAW_INT, GLOBAL_POSITION_INT messages)",
                "GPS Week/Millisecond absolute timestamps",
                "TimeUS relative timestamps as fallback"
            ],
            outputFormats: [
                "UTC timestamps in multiple display formats",
                "Flight-relative time (T+XXX.XXs)",
                "Correlation with filename timestamps",
                "Timeline-compatible message structures"
            ]
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FlightLogGPSIntegrator }
} else if (typeof window !== 'undefined') {
    window.FlightLogGPSIntegrator = FlightLogGPSIntegrator
}
