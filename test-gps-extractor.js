#!/usr/bin/env node

// Test the GPS timestamp extractor with our .bin file
const fs = require('fs')
const path = require('path')
const GPSTimestampExtractor = require('./src/utils/gpsTimestampExtractor.js')

function testGPSExtractor() {
    const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')
    
    if (!fs.existsSync(binLogPath)) {
        console.log('Test file not found:', binLogPath)
        return
    }

    console.log('=== GPS TIMESTAMP EXTRACTOR TEST ===')
    console.log('Testing with:', path.basename(binLogPath))
    
    const buffer = fs.readFileSync(binLogPath)
    const extractor = new GPSTimestampExtractor()
    
    console.log('Extracting timestamps...')
    const result = extractor.extractTimestamps(buffer, 'bin')
    
    console.log('\n=== EXTRACTION RESULTS ===')
    console.log(`Message types found: ${result.messageTypes.size}`)
    
    // Show found message types
    console.log('\n=== MESSAGE TYPES DISCOVERED ===')
    let gpsTypeCount = 0
    for (const [type, def] of result.messageTypes) {
        const isGpsRelated = def.name === 'PSQ' || def.name === 'BREQ' || def.name === 'RAWQ' || 
                           def.labels.some(l => l === 'GWk' || l === 'GMS' || l === 'Week' || l === 'WkMS')
        
        if (isGpsRelated) {
            console.log(`  *** GPS Type ${type}: ${def.name} - ${def.labels.slice(0, 5).join(', ')}${def.labels.length > 5 ? '...' : ''}`)
            gpsTypeCount++
        } else {
            console.log(`  Type ${type}: ${def.name} - ${def.labels.slice(0, 5).join(', ')}${def.labels.length > 5 ? '...' : ''}`)
        }
    }
    
    console.log(`\nFound ${gpsTypeCount} GPS-related message types`)
    
    console.log(`GPS Lock: ${result.hasGPSLock ? 'YES' : 'NO'}`)
    console.log(`Flight Duration: ${result.flightDuration.toFixed(2)} seconds`)
    console.log(`Relative Timestamps: ${result.relativeTimestamps.length}`)
    console.log(`GPS Timestamps: ${result.gpsTimestamps.length}`)
    
    if (result.startTime) {
        console.log(`Flight Start Time: ${extractor.formatTimeForDisplay(result.startTime)}`)
    }
    
    if (result.timeRange) {
        console.log(`Time Range: ${extractor.formatTimeForDisplay(result.timeRange.start)} to ${extractor.formatTimeForDisplay(result.timeRange.end)}`)
    }

    // Show sample timestamps
    console.log('\n=== SAMPLE RELATIVE TIMESTAMPS ===')
    const relSamples = result.relativeTimestamps.slice(0, 5)
    relSamples.forEach((ts, i) => {
        console.log(`  ${i + 1}. ${ts.seconds.toFixed(3)}s (${ts.timeUS}µs) - ${ts.messageType}`)
    })

    console.log('\n=== SAMPLE GPS TIMESTAMPS ===')
    const gpsSamples = result.gpsTimestamps.slice(0, 5)
    gpsSamples.forEach((ts, i) => {
        console.log(`  ${i + 1}. Week ${ts.gpsWeek}, MS ${ts.gpsMS} -> ${extractor.formatTimeForDisplay(ts.utcTime)} - ${ts.messageType}`)
    })

    // Test interpolation at different flight times
    console.log('\n=== INTERPOLATION TEST ===')
    if (result.relativeTimestamps.length > 0) {
        const testTimes = [
            result.relativeTimestamps[0].timeUS, // Start
            result.relativeTimestamps[Math.floor(result.relativeTimestamps.length / 2)].timeUS, // Middle
            result.relativeTimestamps[result.relativeTimestamps.length - 1].timeUS // End
        ]

        testTimes.forEach((timeUS, i) => {
            const gpsTime = extractor.getGPSTimeAtRelativeTime(result, timeUS)
            const relativeSeconds = timeUS / 1000000
            
            if (gpsTime) {
                console.log(`  T+${relativeSeconds.toFixed(3)}s -> ${extractor.formatTimeForDisplay(gpsTime, true)}`)
            } else {
                console.log(`  T+${relativeSeconds.toFixed(3)}s -> No GPS data available`)
            }
        })
    }

    // Compare with filename timestamp
    console.log('\n=== FILENAME CORRELATION ===')
    const filename = path.basename(binLogPath)
    const filenameMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2})-(\d{2})-(\d{2})/)
    
    if (filenameMatch && result.startTime) {
        const [, year, month, day, hour, minute, second] = filenameMatch
        const expectedTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
        const timeDiff = Math.abs(result.startTime.getTime() - expectedTime.getTime()) / 1000 / 60
        
        console.log(`Filename time: ${extractor.formatTimeForDisplay(expectedTime)}`)
        console.log(`Extracted time: ${extractor.formatTimeForDisplay(result.startTime)}`)
        console.log(`Difference: ${timeDiff.toFixed(1)} minutes`)
        
        if (timeDiff < 60) {
            console.log('✓ Times correlate well!')
        } else {
            console.log('! Significant time difference')
        }
    }

    return result
}

// Run the test
testGPSExtractor()
