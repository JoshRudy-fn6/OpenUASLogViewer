#!/usr/bin/env node

// Simple .bin file timestamp checker
const fs = require('fs')
const path = require('path')

function analyzeFileTimestamp(buffer, filename) {
    console.log('=== FILE TIMESTAMP ANALYSIS ===')
    console.log('File size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB')
    
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
    
    console.log(`\nFilename suggests log was created: ${expectedDate.toISOString()}`)
    console.log(`Expected Unix timestamp: ${expectedUnixSec} seconds (${expectedUnixMs} ms)`)
    
    // GPS epoch starts January 6, 1980
    const gpsEpoch = new Date('1980-01-06T00:00:00Z').getTime()
    const expectedGpsWeek = Math.floor((expectedUnixMs - gpsEpoch) / (7 * 24 * 60 * 60 * 1000))
    const expectedGpsMs = (expectedUnixMs - gpsEpoch) % (7 * 24 * 60 * 60 * 1000)
    
    console.log(`Expected GPS Week: ${expectedGpsWeek}`)
    console.log(`Expected GPS Milliseconds in week: ${expectedGpsMs}`)
    
    // Look for GPS week patterns in the binary data
    console.log('\n=== SEARCHING FOR GPS WEEK PATTERNS ===')
    
    // GPS week 2368 = 0x0940 in hex
    const targetWeek = expectedGpsWeek
    const weekBytes = Buffer.from([targetWeek & 0xFF, (targetWeek >> 8) & 0xFF])
    
    console.log(`Looking for GPS week ${targetWeek} (0x${targetWeek.toString(16).padStart(4, '0')})`)
    
    let weekMatches = 0
    for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i] === weekBytes[0] && buffer[i + 1] === weekBytes[1]) {
            weekMatches++
            if (weekMatches <= 5) { // Show first few matches
                console.log(`  Found potential GPS week at offset ${i}: 0x${buffer[i].toString(16).padStart(2, '0')}${buffer[i + 1].toString(16).padStart(2, '0')}`)
            }
        }
    }
    console.log(`Total potential GPS week matches: ${weekMatches}`)
    
    // Look for common timestamp patterns
    console.log('\n=== SEARCHING FOR TIMESTAMP PATTERNS ===')
    
    // Look for TimeUS patterns (microseconds since boot)
    // These are usually 64-bit values that increase over time
    const timeUSCandidates = []
    for (let i = 0; i < buffer.length - 8; i += 4) {
        try {
            const value = buffer.readBigUInt64LE(i)
            const numValue = Number(value)
            
            // Look for reasonable TimeUS values (0 to ~1 hour in microseconds)
            if (numValue > 0 && numValue < 3600000000) { // 0 to 1 hour in microseconds
                timeUSCandidates.push({ offset: i, value: numValue, seconds: numValue / 1000000 })
            }
        } catch (e) {
            // Skip invalid reads
        }
    }
    
    if (timeUSCandidates.length > 0) {
        console.log(`Found ${timeUSCandidates.length} potential TimeUS values`)
        
        // Show a sampling of the values
        const samples = timeUSCandidates.slice(0, 10)
        samples.forEach(({ offset, value, seconds }) => {
            console.log(`  Offset ${offset}: ${value} µs (${seconds.toFixed(3)}s)`)
        })
        
        if (timeUSCandidates.length > 10) {
            console.log(`  ... and ${timeUSCandidates.length - 10} more`)
        }
        
        // Check if values are increasing (indicating a timeline)
        const sortedByOffset = timeUSCandidates.sort((a, b) => a.offset - b.offset)
        let increasingCount = 0
        for (let i = 1; i < Math.min(sortedByOffset.length, 100); i++) {
            if (sortedByOffset[i].value > sortedByOffset[i-1].value) {
                increasingCount++
            }
        }
        console.log(`  ${increasingCount}/${Math.min(sortedByOffset.length - 1, 99)} values are increasing (${(increasingCount / Math.min(sortedByOffset.length - 1, 99) * 100).toFixed(1)}%)`)
    }
    
    // Check file creation time vs filename time
    console.log('\n=== FILE METADATA COMPARISON ===')
    try {
        const stats = fs.statSync(path.join(__dirname, 'src', 'assets', filename))
        console.log(`File created: ${stats.birthtime.toISOString()}`)
        console.log(`File modified: ${stats.mtime.toISOString()}`)
        
        const timeDiff = Math.abs(expectedDate.getTime() - stats.mtime.getTime()) / 1000 / 60
        console.log(`Time difference between filename and file mtime: ${timeDiff.toFixed(1)} minutes`)
        
        if (timeDiff < 10) {
            console.log('✓ Filename timestamp closely matches file modification time')
        } else {
            console.log('! Significant time difference between filename and file timestamp')
        }
    } catch (e) {
        console.log('Could not read file metadata:', e.message)
    }
}

// Main execution
const filename = '2025-05-26 12-07-34.bin'
const binLogPath = path.join(__dirname, 'src', 'assets', filename)

if (fs.existsSync(binLogPath)) {
    const buffer = fs.readFileSync(binLogPath)
    analyzeFileTimestamp(buffer, filename)
} else {
    console.log('File not found:', binLogPath)
}
