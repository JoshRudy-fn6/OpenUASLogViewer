#!/usr/bin/env node

// Quick timestamp correlation analysis for ArduPilot .bin files
const fs = require('fs')
const path = require('path')

function quickTimestampScan(buffer) {
    console.log('Quick scanning for timestamp correlation...')
    console.log('File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB')
    
    const results = {
        messageTypes: new Map(),
        timeUSValues: [],
        gpsTimeValues: [],
        timeMessages: []
    }
    
    let offset = 0
    let messageCount = 0
    const maxMessages = 50000 // Increase limit to get more data
    
    while (offset < buffer.length - 10 && messageCount < maxMessages) {
        // Look for ArduPilot message header
        if (buffer[offset] === 0xA3 && buffer[offset + 1] === 0x95) {
            const msgType = buffer[offset + 2]
            const length = buffer[offset + 3]
            
            // Skip if length is unreasonable
            if (length > 200 || length < 4) {
                offset++
                continue
            }
            
            try {
                // Check if this is a format message (type 0x80)
                if (msgType === 0x80) {
                    const nameStart = offset + 6
                    const name = buffer.slice(nameStart, nameStart + 4).toString('ascii').replace(/\0/g, '').trim()
                    
                    if (name) {
                        const formatStart = nameStart + 4
                        const format = buffer.slice(formatStart, formatStart + 16).toString('ascii').replace(/\0/g, '').trim()
                        const labelsStart = formatStart + 16
                        const labels = buffer.slice(labelsStart, labelsStart + 64).toString('ascii').replace(/\0/g, '').trim()
                        
                        results.messageTypes.set(msgType, { name, format, labels })
                        
                        // Look for time-related message types
                        if (name.includes('GPS') || name.includes('TIME') || name.includes('PSQ') || 
                            labels.includes('TimeUS') || labels.includes('GWk') || labels.includes('GMS')) {
                            console.log(`Time-related format found: ${name} - ${labels}`)
                        }
                    }
                }
                
                // For data messages, check if we know the format and if it contains time data
                const formatDef = results.messageTypes.get(msgType)
                if (formatDef && messageCount < 5000) { // Parse more messages for better data
                    const labels = formatDef.labels.split(',').map(l => l.trim())
                    
                    if (labels.includes('TimeUS') || labels.includes('GWk') || labels.includes('GMS')) {
                        // Quick parse just the time fields
                        let dataOffset = offset + 4
                        const timeData = { type: formatDef.name, msgType }
                        
                        try {
                            for (let i = 0; i < formatDef.format.length && i < labels.length && dataOffset < offset + length; i++) {
                                const formatChar = formatDef.format[i]
                                const label = labels[i]
                                
                                if (label === 'TimeUS' && formatChar === 'Q') {
                                    // Read 64-bit timestamp
                                    if (dataOffset + 8 <= buffer.length) {
                                        const timeUS = buffer.readBigUInt64LE(dataOffset)
                                        timeData.TimeUS = timeUS
                                        results.timeUSValues.push(Number(timeUS))
                                    }
                                    dataOffset += 8
                                } else if (label === 'GWk' && formatChar === 'H') {
                                    // GPS week is 16-bit
                                    if (dataOffset + 2 <= buffer.length) {
                                        const value = buffer.readUInt16LE(dataOffset)
                                        timeData.GWk = value
                                        results.gpsTimeValues.push({ label: 'GWk', value })
                                    }
                                    dataOffset += 2
                                } else if (label === 'GMS' && formatChar === 'I') {
                                    // GPS milliseconds is 32-bit
                                    if (dataOffset + 4 <= buffer.length) {
                                        const value = buffer.readUInt32LE(dataOffset)
                                        timeData.GMS = value
                                        results.gpsTimeValues.push({ label: 'GMS', value })
                                    }
                                    dataOffset += 4
                                } else {
                                    // Skip other fields based on format
                                    switch (formatChar) {
                                        case 'B': dataOffset += 1; break
                                        case 'H': dataOffset += 2; break
                                        case 'I': case 'L': case 'e': case 'f': dataOffset += 4; break
                                        case 'Q': dataOffset += 8; break
                                        case 'n': dataOffset += 4; break
                                        case 'N': dataOffset += 16; break
                                        case 'Z': dataOffset += 64; break
                                        default: dataOffset += 1
                                    }
                                }
                            }
                        } catch (parseError) {
                            // Skip this message if parsing fails
                            console.log(`Parse error for ${formatDef.name}: ${parseError.message}`)
                        }
                        
                        if (timeData.TimeUS || timeData.GWk !== undefined || timeData.GMS !== undefined) {
                            results.timeMessages.push(timeData)
                        }
                    }
                    
                    messageCount++
                }
                
                offset += length
            } catch (error) {
                offset++
            }
        } else {
            offset++
        }
    }
    
    return results
}

function analyzeTimeCorrelation(results, filename) {
    console.log('\n=== TIMESTAMP CORRELATION ANALYSIS ===')
    
    // Extract expected time from filename: "2025-05-26 12-07-34"
    const filenameMatch = filename.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2})-(\d{2})-(\d{2})/)
    if (!filenameMatch) {
        console.log('Could not parse timestamp from filename:', filename)
        return
    }
    
    const [, year, month, day, hour, minute, second] = filenameMatch
    const expectedDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
    const expectedUnixMs = expectedDate.getTime()
    const expectedUnixSec = Math.floor(expectedUnixMs / 1000)
    
    console.log(`Filename timestamp: ${expectedDate.toISOString()}`)
    console.log(`Expected Unix timestamp: ${expectedUnixSec} (${expectedUnixMs} ms)`)
    
    // GPS epoch starts January 6, 1980
    const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
    const expectedGpsWeek = Math.floor((expectedUnixMs - gpsEpoch) / (7 * 24 * 60 * 60 * 1000))
    const expectedGpsMs = (expectedUnixMs - gpsEpoch) % (7 * 24 * 60 * 60 * 1000)
    
    console.log(`Expected GPS Week: ${expectedGpsWeek}`)
    console.log(`Expected GPS MS: ${expectedGpsMs}`)
    
    // Analyze TimeUS values
    if (results.timeUSValues.length > 0) {
        const minTimeUS = Math.min(...results.timeUSValues)
        const maxTimeUS = Math.max(...results.timeUSValues)
        const durationSec = (maxTimeUS - minTimeUS) / 1000000
        
        console.log(`\nTimeUS Analysis:`)
        console.log(`  Range: ${minTimeUS} to ${maxTimeUS} microseconds`)
        console.log(`  Flight duration: ${durationSec.toFixed(2)} seconds`)
        console.log(`  First TimeUS: ${minTimeUS} (${(minTimeUS / 1000000).toFixed(3)}s from boot)`)
        
        // TimeUS is typically microseconds since boot, not absolute time
        console.log(`  Note: TimeUS appears to be relative time since system boot`)
    }
    
    // Analyze GPS time values
    if (results.gpsTimeValues.length > 0) {
        console.log(`\nGPS Time Analysis:`)
        const gpsWeeks = results.gpsTimeValues.filter(v => v.label === 'GWk').map(v => v.value)
        const gpsMs = results.gpsTimeValues.filter(v => v.label === 'GMS').map(v => v.value)
        
        if (gpsWeeks.length > 0) {
            const uniqueWeeks = [...new Set(gpsWeeks)]
            console.log(`  GPS Weeks found: ${uniqueWeeks.join(', ')}`)
            
            if (uniqueWeeks.includes(expectedGpsWeek)) {
                console.log(`  ✓ Expected GPS week ${expectedGpsWeek} found in data!`)
            } else if (uniqueWeeks.some(w => w > 0)) {
                console.log(`  ! GPS week mismatch. Expected: ${expectedGpsWeek}, Found: ${uniqueWeeks.filter(w => w > 0)}`)
            } else {
                console.log(`  ! No valid GPS week data (all zeros - no GPS lock)`)
            }
        }
        
        if (gpsMs.length > 0) {
            const minMs = Math.min(...gpsMs)
            const maxMs = Math.max(...gpsMs)
            console.log(`  GPS milliseconds range: ${minMs} to ${maxMs}`)
        }
    }
    
    // Show time message types found
    console.log(`\nTime-related message types:`)
    const timeTypes = [...new Set(results.timeMessages.map(m => m.type))]
    timeTypes.forEach(type => {
        const count = results.timeMessages.filter(m => m.type === type).length
        console.log(`  ${type}: ${count} messages`)
    })
    
    // Show sample time messages
    if (results.timeMessages.length > 0) {
        console.log(`\nSample time messages:`)
        const sampleTypes = [...new Set(results.timeMessages.map(m => m.type))].slice(0, 3)
        sampleTypes.forEach(type => {
            const sample = results.timeMessages.find(m => m.type === type)
            console.log(`  ${type}:`, sample)
        })
    }
}

// Main execution
const binLogPath = path.join(__dirname, 'src', 'assets', '2025-05-26 12-07-34.bin')

console.log('Looking for file:', binLogPath)

if (fs.existsSync(binLogPath)) {
    console.log('File found, reading...')
    const buffer = fs.readFileSync(binLogPath)
    console.log('Buffer loaded, starting scan...')
    const results = quickTimestampScan(buffer)
    console.log('Scan complete, analyzing...')
    analyzeTimeCorrelation(results, path.basename(binLogPath))
} else {
    console.log('File not found:', binLogPath)
    // List directory contents
    const dir = path.dirname(binLogPath)
    if (fs.existsSync(dir)) {
        console.log('Directory contents:', fs.readdirSync(dir))
    }
}
